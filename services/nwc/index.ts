require("dotenv").config();
// SENTRY
require("./library/instrument.js");

import log, { LogLevelDesc } from "loglevel";
log.setLevel(process.env.LOGLEVEL as LogLevelDesc);
import {
  getPublicKey,
  Relay,
  nip04,
  useWebSocketImplementation,
} from "nostr-tools";
import { hexToBytes } from "@noble/hashes/utils"; // already an installed dependency
useWebSocketImplementation(require("ws"));
import {
  validateEventAndGetUser,
  broadcastEventResponse,
} from "./library/event";
import {
  payInvoice,
  getBalance,
  makeInvoice,
  lookupInvoice,
} from "./library/method";
import { applySoftRateLimit } from "library/rateLimit";
// Import health check module
import {
  startHeartbeat,
  setServiceHealthy,
  setRelayConnectionStatus,
  updateLastEventTime,
} from "./library/heartbeat";

const { webcrypto } = require("node:crypto");
if (!globalThis.crypto) {
  // Only assign if it doesn't exist
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    writable: true,
    configurable: true,
  });
}
const relayUrl = process.env.WAVLAKE_RELAY;
const walletSk = process.env.WALLET_SERVICE_SECRET;
// Get health check port from env or use default
const healthCheckPort = process.env.HEALTH_CHECK_PORT
  ? parseInt(process.env.HEALTH_CHECK_PORT)
  : 8080;

const walletSkHex = hexToBytes(walletSk);
const walletServicePubkey = getPublicKey(walletSkHex);

// Request handler
const handleRequest = async (event) => {
  log.info(`Received event: ${event.id}, authenticating...`);

  // Update last event time for health check
  updateLastEventTime();

  try {
    // Apply soft rate limit
    const delay = await applySoftRateLimit(event.pubkey);
    if (delay > 0) {
      log.info(
        `Request for ${event.pubkey} delayed by ${delay}ms due to rate limiting`
      );
      const content = JSON.stringify({
        result_type: "RATE_LIMITED",
        message: `Request delayed by ${delay}ms due to rate limiting`,
      });
      broadcastEventResponse(event.pubkey, event.id, content);
    }

    const walletUser = await validateEventAndGetUser(event);

    const decryptedContent = await nip04.decrypt(
      walletSk, // receiver secret
      event.pubkey, // sender pubkey
      event.content
    );
    const { method, params } = JSON.parse(decryptedContent);

    // If no user found, return
    if (!walletUser) {
      log.info(`No user found for wallet connection ${event.pubkey}`);
      const content = JSON.stringify({
        result_type: method,
        error: {
          code: "UNAUTHORIZED",
          message: "No user found for pubkey",
        },
      });
      broadcastEventResponse(event.pubkey, event.id, content);
      return;
    }

    switch (method) {
      case "pay_invoice":
        return payInvoice(event, decryptedContent, walletUser);
      case "get_balance":
        return getBalance(event, walletUser);
      // case "make_invoice":
      //   return makeInvoice(event, walletUser);
      case "lookup_invoice":
        return lookupInvoice(event, params, walletUser);
      default:
        log.info(`No method found for ${method}`);
    }
  } catch (err) {
    log.error(`Error handling request ${err}`);
    return;
  }
};

let isConnected = false;
let relay = null;
let reconnectAttempts = 0;

// Connection management constants
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY_MS = 5000; // 5 seconds initial delay
const BACKOFF_MULTIPLIER = 1.5; // Grows delay by 50% each attempt

const scheduleReconnect = () => {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    log.error(
      `Maximum reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Exiting so systemd can restart the service.`
    );
    setServiceHealthy(false); // Update health check
    process.exit(1); // Exit process to allow systemd to restart it
  }

  const MAX_RECONNECT_DELAY = 300000; // 5 minutes
  const delay = Math.min(
    RECONNECT_DELAY_MS * Math.pow(1.5, reconnectAttempts),
    MAX_RECONNECT_DELAY
  );

  reconnectAttempts++;

  log.info(
    `Scheduling reconnection attempt ${reconnectAttempts} in ${delay}ms`
  );
  setTimeout(connectToRelay, delay);
};

// Function to establish connection to the relay
const connectToRelay = async () => {
  try {
    // Close any existing connection first
    if (relay) {
      log.info("Closing existing relay connection before reconnecting");
      try {
        await relay.close();
      } catch (err) {
        log.warn(`Error closing existing relay: ${err}`);
      }
    }

    setRelayConnectionStatus(false); // Update health status during connection attempt

    log.info(`Connecting to relay at ${relayUrl}`);
    relay = await Relay.connect(relayUrl);

    isConnected = true;
    setRelayConnectionStatus(true); // Update health status after successful connection

    // Subscribe to events
    log.info(`Listening for NWC requests for ${walletServicePubkey}`);
    relay.subscribe(
      [
        {
          kinds: [23194],
          ["#p"]: [walletServicePubkey],
        },
      ],
      {
        onevent(event) {
          log.info(`Received event: ${event.id}`);
          handleRequest(event);
        },
        oneose() {
          log.info("End of stored events received");
        },
        onclose() {
          log.warn("Subscription closed");
          isConnected = false;
          setRelayConnectionStatus(false); // Update health status when connection closes
          scheduleReconnect();
        },
      }
    );

    return true;
  } catch (error) {
    log.error(`Failed to connect to relay: ${error}`);
    isConnected = false;
    setRelayConnectionStatus(false); // Update health status on connection failure
    scheduleReconnect();
    return false;
  }
};

// Remove duplicate SIGTERM handler and improve the remaining one
process.on("SIGTERM", async () => {
  log.info("SIGTERM received, shutting down gracefully");
  setServiceHealthy(false); // Update health status

  if (relay) {
    try {
      await relay.close();
    } catch (err) {
      log.error(`Error closing relay during shutdown: ${err}`);
    }
  }

  process.exit(0);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  log.error(`Uncaught exception: ${error}`);
  log.error(error.stack);
  // Keep running but log the error
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  log.error(`Unhandled promise rejection: ${reason}`, {
    reason: String(reason),
    stack: reason instanceof Error ? reason.stack : "No stack trace",
  });
});

const monitorForNWCRequests = async () => {
  log.info("Starting NWC monitor service");

  // Start the health check server
  startHeartbeat(healthCheckPort);
  log.info(`Health check server started on port ${healthCheckPort}`);

  if (!walletSk) {
    setServiceHealthy(false); // Update health status
    throw new Error(
      "Unable to listen for NWC requests, no wallet service SK found"
    );
  }

  // Initial connection
  const connected = await connectToRelay();

  if (connected) {
    log.info("NWC monitor service started successfully", {
      relayUrl,
      walletServicePubkey,
      maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectDelay: RECONNECT_DELAY_MS,
    });
  }
};

// Start the monitor
monitorForNWCRequests().catch((err) => {
  log.error(`Failed to start NWC monitor: ${err}`);
  setServiceHealthy(false); // Update health status
  process.exit(1); // Exit with error so systemd can restart
});

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

const walletSkHex = hexToBytes(walletSk);
const walletServicePubkey = getPublicKey(walletSkHex);

// Request handler
const handleRequest = async (event) => {
  log.info(`Received event: ${event.id}, authenticating...`);

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

const scheduleReconnect = () => {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    log.error(
      `Maximum reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Exiting so systemd can restart the service.`
    );
    process.exit(1); // Exit process to allow systemd to restart it
    return;
  }

  const delay = RECONNECT_DELAY_MS * Math.pow(1.5, reconnectAttempts);
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

    log.info(`Connecting to relay at ${relayUrl}`);
    relay = await Relay.connect(relayUrl);

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
          scheduleReconnect();
        },
      }
    );

    return true;
  } catch (error) {
    log.error(`Failed to connect to relay: ${error}`);
    isConnected = false;
    scheduleReconnect();
    return false;
  }
};

// Add graceful shutdown handling
process.on("SIGTERM", async () => {
  log.info("SIGTERM received, shutting down gracefully");
  // Close connections, etc.
  process.exit(0);
});

process.on("SIGINT", async () => {
  log.info("SIGINT received, shutting down gracefully");
  // Close connections, etc.
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
  log.error("Unhandled promise rejection", { reason, promise });
  // Keep running but log the error
});

const monitorForNWCRequests = async () => {
  log.info("Starting NWC monitor service");
  if (!walletSk) {
    throw new Error(
      "Unable to listen for NWC requests, no wallet service SK found"
    );
  }

  // Initial connection
  const connected = await connectToRelay();

  if (connected) {
    // Log successful startup
    log.info("NWC monitor service started successfully");
  }
};

// Start the monitor
monitorForNWCRequests().catch((err) => {
  log.error(`Failed to start NWC monitor: ${err}`);
  process.exit(1); // Exit with error so systemd can restart
});

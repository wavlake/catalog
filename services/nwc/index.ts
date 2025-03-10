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

// Configurable constants for rate limiting and backoff
const INITIAL_WINDOW_MS = 60 * 1000; // 60 seconds
const MAX_REQUESTS_PER_WINDOW = 12;
const BACKOFF_FACTOR = 2;
const MAX_BACKOFF_MS = 30 * 1000; // 30 seconds
const BASE_DELAY_MS = 1000; // 1 second base delay for rate-limited requests

// Store for tracking rate limit windows and backoff times
const rateLimitStore = new Map();

// Connection management constants
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY_MS = 5000; // 5 seconds initial delay
const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds

// Global connection state tracking
let isConnected = false;
let relay = null;
let sub = null;
let reconnectAttempts = 0;
let heartbeatInterval = null;

const calculateDelay = (npub) => {
  const now = Date.now();
  let store = rateLimitStore.get(npub);

  if (!store || now - store.windowStart > store.windowMs) {
    // Reset or initialize the store for this npub
    store = {
      windowStart: now,
      windowMs: INITIAL_WINDOW_MS,
      count: 0,
    };
  }

  store.count++;

  if (store.count > MAX_REQUESTS_PER_WINDOW) {
    // Calculate delay based on how much the limit is exceeded
    const excessFactor =
      (store.count - MAX_REQUESTS_PER_WINDOW) / MAX_REQUESTS_PER_WINDOW;
    const delay = Math.min(
      BASE_DELAY_MS * Math.pow(BACKOFF_FACTOR, excessFactor),
      MAX_BACKOFF_MS
    );

    // Increase the window size for the next cycle
    store.windowMs = Math.min(store.windowMs * BACKOFF_FACTOR, MAX_BACKOFF_MS);

    rateLimitStore.set(npub, store);
    return delay;
  }

  rateLimitStore.set(npub, store);
  return 0; // No delay if within rate limit
};

// Soft rate limiter function
const applySoftRateLimit = async (npub) => {
  const delay = calculateDelay(npub);
  if (delay > 0) {
    log.info(`Applying soft rate limit for ${npub}. Delaying by ${delay}ms`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return delay;
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

    // Set up event listeners for the relay
    relay.on("connect", () => {
      log.info(`Connected to relay at ${relayUrl}`);
      isConnected = true;
      reconnectAttempts = 0; // Reset reconnect attempts on successful connection
    });

    relay.on("disconnect", () => {
      log.warn(`Disconnected from relay at ${relayUrl}`);
      isConnected = false;
      scheduleReconnect();
    });

    relay.on("error", (error) => {
      log.error(`Relay error: ${error}`);
      isConnected = false;
      scheduleReconnect();
    });

    // Subscribe to events
    log.info(`Listening for NWC requests for ${walletServicePubkey}`);
    sub = relay.subscribe(
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

// Function to schedule reconnection attempts
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

// Implement a heartbeat to check connection health
const startHeartbeat = () => {
  // Clear any existing interval first
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }

  heartbeatInterval = setInterval(async () => {
    log.debug("Running connection heartbeat check");

    if (!isConnected || !relay) {
      log.warn("Heartbeat detected disconnection. Attempting to reconnect...");
      await connectToRelay();
      return;
    }

    // Test connection by checking relay status
    try {
      // Check if the relay's WebSocket connection is open
      if (relay.status !== 1 && relay.status !== WebSocket.OPEN) {
        log.warn(
          `Relay connection is not active (status: ${relay.status}). Attempting to reconnect...`
        );
        await connectToRelay();
      } else {
        log.debug("Heartbeat: Connection is healthy");
      }
    } catch (error) {
      log.error(`Heartbeat error: ${error}`);
      isConnected = false;
      scheduleReconnect();
    }
  }, HEARTBEAT_INTERVAL_MS);

  return heartbeatInterval;
};

// Main process
const monitorForNWCRequests = async () => {
  log.info("Starting NWC monitor service");
  if (!walletSk) {
    throw new Error(
      "Unable to listen for NWC requests, no wallet service SK found"
    );
  }

  // Initial connection
  await connectToRelay();

  // Start heartbeat monitoring
  startHeartbeat();

  // Log successful startup
  log.info("NWC monitor service started successfully");
};

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
        const content = JSON.stringify({
          result_type: method,
          error: {
            code: "METHOD_NOT_FOUND",
            message: `Method '${method}' not supported`,
          },
        });
        broadcastEventResponse(event.pubkey, event.id, content);
    }
  } catch (err) {
    log.error(`Error handling request: ${err}`);
    try {
      // Try to send error response back to the client
      const content = JSON.stringify({
        result_type: "ERROR",
        error: {
          code: "SERVER_ERROR",
          message: "Internal server error processing request",
        },
      });
      broadcastEventResponse(event.pubkey, event.id, content);
    } catch (responseErr) {
      log.error(`Failed to send error response: ${responseErr}`);
    }
    return;
  }
};

// Add graceful shutdown handling
process.on("SIGTERM", async () => {
  log.info("SIGTERM received, shutting down gracefully");

  // Clear heartbeat interval
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }

  // Close relay connection if it exists
  if (relay) {
    try {
      log.info("Closing relay connection");
      await relay.close();
    } catch (err) {
      log.error(`Error closing relay connection: ${err}`);
    }
  }

  log.info("Shutdown complete");
  process.exit(0);
});

process.on("SIGINT", async () => {
  log.info("SIGINT received, shutting down gracefully");

  // Clear heartbeat interval
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }

  // Close relay connection if it exists
  if (relay) {
    try {
      log.info("Closing relay connection");
      await relay.close();
    } catch (err) {
      log.error(`Error closing relay connection: ${err}`);
    }
  }

  log.info("Shutdown complete");
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

// Start the monitor
monitorForNWCRequests().catch((err) => {
  log.error(`Failed to start NWC monitor: ${err}`);
  process.exit(1); // Exit with error so systemd can restart
});

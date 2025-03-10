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
import { hexToBytes } from "@noble/hashes/utils";
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
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    writable: true,
    configurable: true,
  });
}

// Configuration constants
const relayUrl = process.env.WAVLAKE_RELAY;
const walletSk = process.env.WALLET_SERVICE_SECRET;
const RECONNECT_INTERVAL = 10000; // 10 seconds between reconnection attempts
const KEEPALIVE_INTERVAL = 30000; // 30 seconds heartbeat
const MAX_RECONNECT_ATTEMPTS = 10; // Max reconnection attempts before increasing delay
const RECONNECT_BACKOFF_FACTOR = 1.5; // Exponential backoff factor

// Connection state
let relay = null;
let currentSubscription = null;
let reconnectAttempts = 0;
let reconnectTimer = null;
let keepAliveTimer = null;
let lastEventReceived = Date.now();

const walletSkHex = hexToBytes(walletSk);
const walletServicePubkey = getPublicKey(walletSkHex);

// Store for tracking rate limit windows and backoff times
const rateLimitStore = new Map();

// Configurable constants for rate limiting and backoff
const INITIAL_WINDOW_MS = 60 * 1000; // 60 seconds
const MAX_REQUESTS_PER_WINDOW = 12;
const BACKOFF_FACTOR = 2;
const MAX_BACKOFF_MS = 30 * 1000; // 30 seconds
const BASE_DELAY_MS = 1000; // 1 second base delay for rate-limited requests

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

// Keep-alive function to send a simple subscription and ensure connection is active
const sendKeepAlive = async () => {
  if (!relay || relay.status !== 1) {
    // WebSocket.OPEN = 1
    log.warn(
      "Relay connection not open during keep-alive check, reconnecting..."
    );
    await connectToRelay(); // Reconnect if needed
    return;
  }

  // Create a simple temporary subscription to get the relays attention
  try {
    const pingStartTime = Date.now();
    const keepAliveSub = relay.subscribe([{ kinds: [0], limit: 1 }]);

    // Wait for EOSE as confirmation the connection is live
    const pingTimeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Keep-alive timeout")), 5000);
    });

    const eosePromise = new Promise((resolve) => {
      keepAliveSub.on("eose", () => {
        resolve(true);
      });
    });

    await Promise.race([eosePromise, pingTimeout]);

    // Clean up the subscription
    keepAliveSub.close();

    const pingDuration = Date.now() - pingStartTime;
    log.debug(`Keep-alive ping successful (${pingDuration}ms)`);

    // Reset reconnection attempts on successful ping
    reconnectAttempts = 0;
  } catch (error) {
    log.error(`Keep-alive check failed: ${error.message}`);
    await connectToRelay(); // Try to reconnect
  }
};

// Request handler
const handleRequest = async (event) => {
  // Update the last event timestamp
  lastEventReceived = Date.now();

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

// Setup subscription to listen for NWC requests
const setupSubscription = () => {
  if (!relay) {
    log.error("Cannot setup subscription: relay is not connected");
    return false;
  }

  try {
    // Close any existing subscription to prevent duplicates
    if (currentSubscription) {
      currentSubscription.close();
    }

    log.info(
      `Setting up subscription for NWC requests for ${walletServicePubkey}`
    );

    currentSubscription = relay.subscribe(
      [
        {
          kinds: [23194],
          // only listen for events tagged with our wallet public key
          ["#p"]: [walletServicePubkey],
        },
      ],
      {
        onevent(event) {
          log.info(`Received event: ${event.id}`);
          handleRequest(event);
        },
      }
    );

    return true;
  } catch (error) {
    log.error(`Failed to setup subscription: ${error.message}`);
    return false;
  }
};

// Connect to relay with proper error handling and reconnection logic
const connectToRelay = async () => {
  // Clear any existing timers
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }

  // Close existing connection if it exists
  if (relay) {
    try {
      await relay.close();
    } catch (error) {
      log.warn(`Error closing existing relay connection: ${error.message}`);
    }
    relay = null;
  }

  if (!walletSk) {
    throw new Error("Unable to connect to relay, no wallet service SK found");
  }

  // Calculate backoff time based on reconnect attempts
  const backoffTime =
    reconnectAttempts > MAX_RECONNECT_ATTEMPTS
      ? RECONNECT_INTERVAL *
        Math.pow(
          RECONNECT_BACKOFF_FACTOR,
          reconnectAttempts - MAX_RECONNECT_ATTEMPTS
        )
      : RECONNECT_INTERVAL;

  try {
    log.info(`Connecting to relay ${relayUrl}...`);
    relay = await Relay.connect(relayUrl);

    // Setup connection event listeners
    relay.on("connect", () => {
      log.info(`Connected to relay ${relayUrl}`);
      reconnectAttempts = 0; // Reset reconnect attempts on successful connection

      // Setup subscription
      if (setupSubscription()) {
        log.info("Successfully set up subscription");
      }

      // Setup keep-alive interval
      keepAliveTimer = setInterval(sendKeepAlive, KEEPALIVE_INTERVAL);
    });

    relay.on("error", (error) => {
      log.error(`Relay error: ${error.message}`);
    });

    relay.on("disconnect", () => {
      log.warn(`Disconnected from relay ${relayUrl}`);

      // Clean up resources
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }

      // Schedule reconnection
      reconnectAttempts++;
      reconnectTimer = setTimeout(connectToRelay, backoffTime);
      log.info(
        `Scheduled reconnection attempt ${reconnectAttempts} in ${Math.round(
          backoffTime / 1000
        )} seconds`
      );
    });

    return relay;
  } catch (error) {
    log.error(`Failed to connect to relay: ${error.message}`);

    // Schedule reconnection
    reconnectAttempts++;
    reconnectTimer = setTimeout(connectToRelay, backoffTime);
    log.info(
      `Scheduled reconnection attempt ${reconnectAttempts} in ${Math.round(
        backoffTime / 1000
      )} seconds`
    );

    return null;
  }
};

// Check if we haven't received events for too long
const checkEventActivity = () => {
  const now = Date.now();
  const timeSinceLastEvent = now - lastEventReceived;
  const MAX_EVENT_SILENCE = 15 * 60 * 1000; // 15 minutes

  if (timeSinceLastEvent > MAX_EVENT_SILENCE) {
    log.warn(
      `No events received in ${Math.floor(
        timeSinceLastEvent / 60000
      )} minutes, reconnecting...`
    );
    connectToRelay();
  }
};

// Main monitoring process
const monitorForNWCRequests = async () => {
  log.info("Starting NWC monitor service");

  // Initial connection
  await connectToRelay();

  // Setup periodic activity check every 5 minutes
  setInterval(checkEventActivity, 5 * 60 * 1000);

  // Handle graceful shutdown
  process.on("SIGTERM", async () => {
    log.info("Received SIGTERM, shutting down gracefully");

    // Clear all timers
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (keepAliveTimer) clearInterval(keepAliveTimer);

    // Close relay connection
    if (relay) {
      try {
        await relay.close();
      } catch (error) {
        log.error(`Error during shutdown: ${error.message}`);
      }
    }

    process.exit(0);
  });

  process.on("SIGINT", async () => {
    log.info("Received SIGINT, shutting down gracefully");

    // Clear all timers
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (keepAliveTimer) clearInterval(keepAliveTimer);

    // Close relay connection
    if (relay) {
      try {
        await relay.close();
      } catch (error) {
        log.error(`Error during shutdown: ${error.message}`);
      }
    }

    process.exit(0);
  });
};

// Start the service
monitorForNWCRequests().catch((error) => {
  log.error(`Fatal error in NWC monitor: ${error.message}`);
  process.exit(1);
});

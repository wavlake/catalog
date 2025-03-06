require("dotenv").config();
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

// Main process
const monitorForNWCRequests = async () => {
  console.log("NWC_MONITOR");
  log.info("monitorForNWCRequests");
  if (!walletSk) {
    throw new Error(
      "Unable to listen for NWC requests, no wallet service SK found"
    );
  }

  const relay = await Relay.connect(relayUrl);
  log.info(`Listening for NWC requests for ${walletServicePubkey}`);
  const sub = relay.subscribe(
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

  // sub.on("event", handleRequest);
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
    }
  } catch (err) {
    log.error(`Error handling request ${err}`);
    return;
  }
};

monitorForNWCRequests();

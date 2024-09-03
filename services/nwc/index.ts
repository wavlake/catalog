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
import { rateLimitMiddleware } from "middleware/rate-limit";
const { webcrypto } = require("node:crypto");
globalThis.crypto = webcrypto;

const relayUrl = process.env.WAVLAKE_RELAY;
const walletSk = process.env.WALLET_SERVICE_SECRET;

const walletSkHex = hexToBytes(walletSk);
const walletServicePubkey = getPublicKey(walletSkHex);

// Soft rate limiter function
const applySoftRateLimit = async (npub) => {
  try {
    const startTime = Date.now();
    await rateLimitMiddleware(npub);
    const endTime = Date.now();
    const delay = endTime - startTime;
    return delay;
  } catch (error) {
    console.error("Rate limiting error:", error);
    return 0;
  }
};

// Main process
const monitorForNWCRequests = async () => {
  log.debug("monitorForNWCRequests");
  if (!walletSk) {
    throw new Error(
      "Unable to listen for NWC requests, no wallet service SK found"
    );
  }

  const relay = await Relay.connect(relayUrl);
  log.debug(`Listening for NWC requests for ${walletServicePubkey}`);
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
        log.debug(`Received event: ${event.id}`);
        handleRequest(event);
      },
    }
  );

  // sub.on("event", handleRequest);
};

// Request handler
const handleRequest = async (event) => {
  log.debug(`Received event: ${event.id}, authenticating...`);

  try {
    // Apply soft rate limit
    const delay = await applySoftRateLimit(event.pubkey);
    if (delay > 0) {
      log.debug(
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
      log.debug(`No user found for wallet connection ${event.pubkey}`);
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
        log.debug(`No method found for ${method}`);
    }
  } catch (err) {
    log.debug(`Error handling request ${err}`);
    return;
  }
};

monitorForNWCRequests();

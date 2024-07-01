import dotenv from "dotenv";
dotenv.config();
import log, { LogLevelDesc } from "loglevel";
log.setLevel((process.env.LOGLEVEL as LogLevelDesc) ?? "info");
import { rateLimit } from "express-rate-limit";
import {
  getPublicKey,
  Relay,
  nip04,
  useWebSocketImplementation,
} from "nostr-tools";
import { hexToBytes } from "@noble/hashes/utils"; // already an installed dependency
import ws from "ws";
useWebSocketImplementation(ws);
import {
  validateEventAndGetUser,
  broadcastEventResponse,
} from "./library/event";
import { payInvoice, getBalance } from "./library/method";
const { webcrypto } = require("node:crypto");
globalThis.crypto = webcrypto;

const relayUrl = process.env.WAVLAKE_RELAY;
const walletSk = process.env.WALLET_SERVICE_SECRET;
const walletSkHex = hexToBytes(process.env.WALLET_SERVICE_SECRET);
const walletServicePubkey = getPublicKey(walletSkHex);

// Define rate limiter
const limiter = rateLimit({
  windowMs: 30 * 1000, // 30 seconds
  max: 1, // Limit each npub to 1 requests per `window` (here, per 30 seconds)
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers,
  keyGenerator: (req, res) => req["npub"],
});

// Adaptation of rate limiter for express middleware
const applyRateLimit = async (npub) => {
  // Mock request and response objects
  const request: any = {
    npub: npub,
  };
  const response: any = {
    status: () => {},
    send: () => {},
  };
  return new Promise((resolve, reject) => {
    // limiter runs the callback as if it were the next middleware
    // but this promise will never resolve if the rate limit is exceeded
    // https://github.com/express-rate-limit/express-rate-limit/blob/1a7f98642d4c0c6c418f73e96e72297b5961ad01/source/lib.ts#L422
    limiter(request, response, (result) => {
      result instanceof Error ? reject(true) : resolve(false);
    });
  });
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
      onclose(reason) {
        log.debug("Connection closed: ", reason);
      },
      oneose() {
        log.debug("Connection ended");
      },
    }
  );
  // sub.on("event", handleRequest);
  return sub;
};

// Request handler
const handleRequest = async (event) => {
  log.debug(`Received event: ${event.id}, authenticating...`);

  const walletUser = await validateEventAndGetUser(event);

  const decryptedContent = await nip04.decrypt(
    walletSk, // receiver secret
    event.pubkey, // sender pubkey
    event.content
  );
  // Choose action based on method
  let method;
  try {
    method = JSON.parse(decryptedContent).method;
  } catch (err) {
    log.debug(`Error parsing decrypted content ${err}`);
    return;
  }

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
      // Apply rate limit
      const rateLimited = await Promise.race([
        applyRateLimit(event.pubkey),
        // If rate limit is exceeded, applyRateLimit will never resolve
        // so we need to add a sibling timeout promise to resolve the parent function
        new Promise((resolve, reject) => {
          setTimeout(() => {
            resolve(true);
          }, 500); // 500ms timeout
        }),
      ]);
      if (!rateLimited) {
        log.debug(`Rate limit check for ${event.pubkey} passed`);
      } else {
        log.debug(`Rate limit check for ${event.pubkey} failed`);
        const content = JSON.stringify({
          result_type: method,
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests",
          },
        });
        broadcastEventResponse(event.pubkey, event.id, content);
        return;
      }
      return payInvoice(event, decryptedContent, walletUser);
    case "get_balance":
      return getBalance(event, walletUser);
    default:
      log.debug(`No method found for ${method}`);
  }
};

monitorForNWCRequests();

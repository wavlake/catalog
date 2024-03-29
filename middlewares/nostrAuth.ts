import log from "loglevel";
import asyncHandler from "express-async-handler";
import { Event, Kind, nip98, verifySignature } from "nostr-tools";
import { formatError } from "../library/errors";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { updateNpubMetadata } from "../library/nostr/nostr";

// TODO - replace validateEvent with the nostr-tools version once the payload hash feature of NIP-98 is implemented
// https://github.com/nbd-wtf/nostr-tools/blob/master/nip98.ts
// https://github.com/nbd-wtf/nostr-tools/issues/307
const utf8Encoder = new TextEncoder();
function hashPayload(payload: any): string {
  const hash = sha256(utf8Encoder.encode(JSON.stringify(payload)));
  return bytesToHex(hash);
}

async function validateEvent(
  event: Event,
  url: string,
  method: string,
  body?: any
): Promise<boolean> {
  if (!event) {
    throw new Error("Invalid nostr event");
  }
  if (!verifySignature(event)) {
    throw new Error("Invalid nostr event, signature invalid");
  }
  if (event.kind !== Kind.HttpAuth) {
    throw new Error("Invalid nostr event, kind invalid");
  }

  if (!event.created_at) {
    throw new Error("Invalid nostr event, created_at invalid");
  }

  // Event must be less than 60 seconds old
  if (Math.round(new Date().getTime() / 1000) - event.created_at > 60) {
    throw new Error("Invalid nostr event, expired");
  }

  const urlTag = event.tags.find((t) => t[0] === "u");
  if (urlTag?.length !== 1 && urlTag?.[1] !== url) {
    throw new Error("Invalid nostr event, url tag invalid");
  }

  const methodTag = event.tags.find((t) => t[0] === "method");
  if (
    methodTag?.length !== 1 &&
    methodTag?.[1].toLowerCase() !== method.toLowerCase()
  ) {
    throw new Error("Invalid nostr event, method tag invalid");
  }

  if (Boolean(body) && Object.keys(body).length > 0) {
    const payloadTag = event.tags.find((t) => t[0] === "payload");
    if (payloadTag?.[1] !== hashPayload(body)) {
      throw new Error(
        "Invalid payload tag hash, does not match request body hash"
      );
    }
  }
  return true;
}

// This middleware is used to authenticate requests from Nostr
// It follows the NIP-98 spec - https://github.com/nostr-protocol/nips/blob/master/98.md
export const isNostrAuthorized = asyncHandler(async (req, res, next) => {
  try {
    const { authorization } = req.headers;
    if (!authorization) {
      const error = formatError(401, "Missing authorization header");
      next(error);
      return;
    }

    const nostrEvent = await nip98.unpackEventFromToken(authorization);

    const host = req.get("host");
    // req.protocol may be "http" when express is behind a proxy or load balancer
    // so we hardcode it as HTTPS here, since that is what the client will be using
    const fullUrl = `${
      host.includes("localhost") ? req.protocol : "https"
    }://${host}${req.originalUrl}`;

    const eventIsValid = await validateEvent(
      nostrEvent,
      fullUrl,
      req.method,
      req.body
    );

    // TODO- replace with nip98.validateEvent, imported from nostr-tools
    if (!eventIsValid) {
      const error = formatError(401, "Invalid event");
      next(error);
      return;
    }

    // TODO - move this to be triggered elsewhere (e.g. when a zap invoice is paid), once server migration to catalog is complete
    // async update the npub metadata in the db
    updateNpubMetadata(nostrEvent.pubkey)
      .then(({ isSuccess }) => {
        log.debug(
          `${isSuccess ? "Updated" : "Failed to update"} nostr metadata for: ${
            nostrEvent.pubkey
          }`
        );
      })
      .catch((err) => {
        log.debug("error updating npub metadata: ", err);
      });

    // successfull auth'd, add the event to res.locals so other middleware can use it
    // https://expressjs.com/en/api.html#res.locals
    res.locals.authEvent = nostrEvent;
    next();
  } catch (err) {
    const error = formatError(401, err);
    next(error);
  }
});

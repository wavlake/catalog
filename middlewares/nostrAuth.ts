import asyncHandler from "express-async-handler";
import { Event, Kind, nip98, verifySignature } from "nostr-tools";
import { formatError } from "../library/errors";
import { base64 } from "@scure/base";

// TODO - replace validateEvent with the nostr-tools version once the payload hash feature of NIP-98 is implemented
// https://github.com/nostr-protocol/nips/blob/master/98.md#nostr-event
// https://github.com/nbd-wtf/nostr-tools/blob/master/nip98.ts
// https://github.com/nbd-wtf/nostr-tools/issues/307
const utf8Encoder = new TextEncoder();
function hashPayload(payload: any): string {
  return base64.encode(utf8Encoder.encode(JSON.stringify(payload)));
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

  if (method.toLowerCase() !== "get") {
    const payloadTag = event.tags.find((t) => t[0] === "payload");
    if (payloadTag?.length !== 1) {
      throw new Error("Invalid nostr event, payload tag invalid");
    }
    if (payloadTag?.[1] !== hashPayload(body)) {
      throw new Error(
        "Invalid payload tag hash, does not match request body hash"
      );
    }
  }
  return true;
}

export const isNostrAuthorized = asyncHandler(async (req, res, next) => {
  try {
    const { authorization } = req.headers;
    if (!authorization) {
      const error = formatError(401, "Missing authorization header");
      next(error);
      return;
    }

    const nostrEvent = await nip98.unpackEventFromToken(authorization);

    const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

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

    // successfull auth'd, add the event to res.locals so other middleware can use it
    // https://expressjs.com/en/api.html#res.locals
    res.locals.authEvent = nostrEvent;
    next();
  } catch (err) {
    const error = formatError(401, err);
    next(error);
  }
});

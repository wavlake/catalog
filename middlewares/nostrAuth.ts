import log from "../library/winston";
import asyncHandler from "express-async-handler";
import { nip98 } from "nostr-tools";
import { formatError } from "../library/errors";
import { updateNpubMetadata } from "../library/nostr/nostr";

// This middleware is used to authenticate requests from Nostr
// It follows the NIP-98 spec - https://github.com/nostr-protocol/nips/blob/master/98.md
export const validateNostrEvent = async (req, res) => {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader) {
      throw "Missing authorization header";
    }

    const nostrEvent = await nip98.unpackEventFromToken(authHeader);

    const host = req.get("host");
    // req.protocol may be "http" when express is behind a proxy or load balancer
    // so we hardcode it as HTTPS here, since that is what the client will be using
    const fullUrl = `${
      host.includes("localhost") ? req.protocol : "https"
    }://${host}${req.originalUrl}`;

    const eventIsValid = await nip98.validateEvent(
      nostrEvent,
      fullUrl,
      req.method,
      req.body
    );
    if (!eventIsValid) {
      throw "Invalid event";
    }
    log.info("Nostr event is valid", nostrEvent);
    // successfull auth'd, add the event to res.locals so other middleware can use it
    // https://expressjs.com/en/api.html#res.locals
    res.locals.authEvent = nostrEvent;
    return nostrEvent;
  } catch (err) {
    log.error("Error validating Nostr event", err);
    throw "Invalid event";
  }
};

export const isNostrAuthorized = asyncHandler(async (req, res, next) => {
  await validateNostrEvent(req, res).catch((err) => {
    const error = formatError(401, err);
    throw error;
  });

  next();
});

export const isNostrAuthorizedOptional = asyncHandler(
  async (req, res, next) => {
    await validateNostrEvent(req, res).catch((err) => {
      log.info("Nostr auth failed on optional route, continuing without auth");
    });

    next();
  }
);

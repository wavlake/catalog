import log from "loglevel";
import asyncHandler from "express-async-handler";
import { nip98 } from "nostr-tools";
import { formatError } from "../library/errors";
import { updateNpubMetadata } from "../library/nostr/nostr";

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

    const eventIsValid = await nip98.validateEvent(
      nostrEvent,
      fullUrl,
      req.method,
      req.body
    );
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

import asyncHandler from "express-async-handler";
import { Event, validateEvent, verifySignature } from "nostr-tools";

export const isNostrAuthorized = asyncHandler(async (req, res, next) => {
  const { nostrEvent } = req.query;
  const parsedEvent = JSON.parse(nostrEvent as string) as Event;

  if (!parsedEvent) {
    res.status(400).json({ success: false, error: "No event provided" });
    return;
  }

  if (!validateEvent(parsedEvent)) {
    res.status(400).json({ success: false, error: "Invalid event" });
  }
  if (!verifySignature(parsedEvent)) {
    res.status(401).json({ success: false, error: "Invalid event signature" });
  }

  // https://expressjs.com/en/api.html#res.locals
  res.locals.parsedEvent = parsedEvent;
  next();
});

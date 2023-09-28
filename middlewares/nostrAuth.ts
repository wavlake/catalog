import asyncHandler from "express-async-handler";
import { validateEvent, verifySignature } from "nostr-tools";

export const isNostrAuthorized = asyncHandler(async (req, res, next) => {
  const { nostr: event } = req.body;

  if (!event) {
    res.status(400).json({ success: false, error: "No event provided" });
    return;
  }

  if (!validateEvent(event)) {
    res.status(400).json({ success: false, error: "Invalid event" });
  }
  if (!verifySignature(event)) {
    res.status(401).json({ success: false, error: "Invalid event signature" });
  }

  next();
});

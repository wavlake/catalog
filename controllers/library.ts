import asyncHandler from "express-async-handler";
import { Event } from "nostr-tools";
import prisma from "../prisma/client";

type EventContent = {
  contentIds: string[];
};

const get_user_library = asyncHandler(async (req, res, next) => {
  const { nostr } = req.body;

  const npub = (nostr as Event).pubkey;

  const libraryContent = await prisma.library.findMany({
    where: {
      user_id: npub,
    },
  });

  res.json({ success: true, data: libraryContent });
});

const add_to_library = asyncHandler(async (req, res, next) => {
  try {
    const { nostr } = req.body;
    if (!nostr) {
      res.status(400).json({ success: false, error: "No event found" });
      return;
    }

    const npub = (nostr as Event).pubkey;
    const content: EventContent = JSON.parse(nostr.content);
    const { contentIds } = content;

    if (!npub) {
      res.status(400).json({ success: false, error: "No npub found" });
      return;
    }
    if (!contentIds.length) {
      res.status(400).json({ success: false, error: "No content ids found" });
      return;
    }

    await prisma.library.createMany({
      data: contentIds.map((contentId) => ({
        user_id: npub,
        content_id: contentId,
      })),
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err });
  }
});

const remove_from_library = asyncHandler(async (req, res, next) => {
  try {
    const { nostr } = req.body;
    if (!nostr) {
      res.status(400).json({ success: false, error: "No event found" });
      return;
    }

    const npub = (nostr as Event).pubkey;
    const content: EventContent = JSON.parse(nostr.content);
    const { contentIds } = content;

    if (!npub) {
      res.status(400).json({ success: false, error: "No npub found" });
      return;
    }
    if (!contentIds.length) {
      res.status(400).json({ success: false, error: "No content ids found" });
      return;
    }

    await prisma.library.deleteMany({
      where: {
        user_id: npub,
        content_id: {
          in: contentIds,
        },
      },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err });
  }
});

export default {
  get_user_library,
  add_to_library,
  remove_from_library,
};

import asyncHandler from "express-async-handler";
import { Event } from "nostr-tools";
import prisma from "../prisma/client";
import { log } from "console";
import { formatError } from "../library/errors";

type EventContent = {
  contentIds: string[];
};

const get_user_library = asyncHandler(async (req, res, next) => {
  try {
    const parsedEvent: Event = res.locals.parsedEvent;
    const npub = parsedEvent.pubkey;

    const libraryContent = await prisma.library.findMany({
      where: {
        user_id: npub,
      },
    });

    res.json({ success: true, data: libraryContent });
  } catch (err) {
    const error = formatError(500, err);
    next(error);
  }
});

const add_to_library = asyncHandler(async (req, res, next) => {
  try {
    const parsedEvent: Event = res.locals.parsedEvent;
    if (!parsedEvent) {
      const error = formatError(400, "No event found");
      next(error);
      return;
    }

    const npub = parsedEvent.pubkey;
    const content: EventContent = JSON.parse(parsedEvent.content);
    const { contentIds = [] } = content;
    console.log({ content });
    if (!npub) {
      const error = formatError(400, "No npub found");
      next(error);
      return;
    }
    if (!contentIds.length) {
      const error = formatError(
        400,
        "Request must include a list of content ids"
      );
      next(error);
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
    const error = formatError(500, err);
    next(error);
  }
});

const remove_from_library = asyncHandler(async (req, res, next) => {
  try {
    const parsedEvent: Event = res.locals.parsedEvent;
    if (!parsedEvent) {
      const error = formatError(400, "No event found");
      next(error);
      return;
    }

    const npub = parsedEvent.pubkey;
    const content: EventContent = JSON.parse(parsedEvent.content);
    const { contentIds = [] } = content;

    if (!npub) {
      const error = formatError(400, "No npub found");
      next(error);
      return;
    }
    if (!contentIds.length) {
      const error = formatError(
        400,
        "Request must include a list of content ids"
      );
      next(error);
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
    const error = formatError(500, err);
    next(error);
  }
});

export default {
  get_user_library,
  add_to_library,
  remove_from_library,
};

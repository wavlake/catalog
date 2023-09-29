import asyncHandler from "express-async-handler";
import { Event } from "nostr-tools";
import prisma from "../prisma/client";
import { formatError } from "../library/errors";

const get_user_library = asyncHandler(async (req, res, next) => {
  try {
    const { pubkey } = res.locals.authEvent as Event;

    const libraryContent = await prisma.library.findMany({
      where: {
        user_id: pubkey,
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
    const { pubkey } = res.locals.authEvent as Event;

    if (!pubkey) {
      const error = formatError(400, "No pubkey found");
      next(error);
      return;
    }

    const { contentIds = [] } = req.body;

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
        user_id: pubkey,
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
    const { pubkey } = res.locals.authEvent as Event;

    if (!pubkey) {
      const error = formatError(400, "No pubkey found");
      next(error);
      return;
    }
    const { contentIds = [] } = req.body;

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
        user_id: pubkey,
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

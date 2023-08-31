import prisma from "../prisma/client";
import db from "../library/db";
import log from "loglevel";
import asyncHandler from "express-async-handler";
import { SplitRecipient } from "@prisma/client";
import { formatError } from "../library/errors";
import { isContentOwner } from "../library/userHelper";

const create_split = asyncHandler(async (req, res, next) => {
  const { contentId, contentType, splits } = req.body;
  const userId = req["uid"];

  // Does user own this content?
  const isOwner = await isContentOwner(userId, contentId, contentType);

  if (!isOwner) {
    const error = formatError(403, "User does not own this content");
    next(error);
  }

  const splitRecipients: SplitRecipient[] = splits.map((split) => {
    return {
      userId: split.userId,
      share: split.splitPercentage,
    };
  });

  try {
    const split = await prisma.split.create({
      data: {
        contentId: contentId,
        contentType: contentType,
        splitRecipient: {
          createMany: { data: splitRecipients },
        },
      },
      include: {
        splitRecipient: true,
      },
    });

    res.status(200).json({ success: true, data: split });
  } catch (e) {
    const error = formatError(500, `${e.code}: ${e.message}`);
    next(error);
  }
});

const get_split = asyncHandler(async (req, res, next) => {
  const { contentId, contentType } = req.params;
  const userId = req["uid"];
  console.log("contentId", contentId);
  // Does user own this content?
  const isOwner = await isContentOwner(userId, contentId, contentType);

  if (!isOwner) {
    const error = formatError(403, "User does not own this content");
    next(error);
  }

  try {
    const split = await prisma.split.findFirst({
      where: {
        contentId: contentId,
        contentType: contentType,
      },
      include: {
        splitRecipient: true,
      },
    });

    res.status(200).json({ success: true, data: split });
  } catch (e) {
    const error = formatError(500, `${e.code}: ${e.message}`);
    next(error);
  }
});

export default {
  create_split,
  get_split,
};

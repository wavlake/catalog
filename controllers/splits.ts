import prisma from "../prisma/client";
import asyncHandler from "express-async-handler";
import { SplitRecipient } from "@prisma/client";
import { formatError } from "../library/errors";
import { isContentOwner } from "../library/userHelper";

const create_split = asyncHandler(async (req, res, next) => {
  const { contentId, contentType, splitRecipients } = req.body;
  const userId = req["uid"];

  // Does user own this content?
  const isOwner = await isContentOwner(userId, contentId, contentType);

  if (!isOwner) {
    const error = formatError(403, "User does not own this content");
    next(error);
  }

  const newSplits: SplitRecipient[] = splitRecipients.map((split) => {
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
        splitRecipients: {
          createMany: { data: newSplits },
        },
      },
      include: {
        splitRecipients: true,
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
        splitRecipients: true,
      },
    });

    res.status(200).json({ success: true, data: split });
  } catch (e) {
    const error = formatError(500, `${e.code}: ${e.message}`);
    next(error);
  }
});

const update_split = asyncHandler(async (req, res, next) => {
  const { contentId, contentType, splitRecipients } = req.body;
  const userId = req["uid"];

  // Does user own this content?
  const isOwner = await isContentOwner(userId, contentId, contentType);

  if (!isOwner) {
    const error = formatError(403, "User does not own this content");
    next(error);
  }

  const splitId = await prisma.split.findFirst({
    where: {
      contentId: contentId,
      contentType: contentType,
    },
    select: {
      id: true,
    },
  });

  if (!splitId) {
    const error = formatError(404, "Split not found");
    next(error);
  }

  const newSplits: SplitRecipient[] = splitRecipients.map((split) => {
    return {
      userId: split.userId,
      share: split.splitPercentage,
    };
  });

  try {
    const split = await prisma.split.update({
      where: {
        id: splitId.id,
      },
      data: {
        contentId: contentId,
        contentType: contentType,
        splitRecipients: {
          deleteMany: {},
          createMany: { data: newSplits },
        },
      },
      include: {
        splitRecipients: true,
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
  update_split,
};

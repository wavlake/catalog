import prisma from "../prisma/client";
import db from "../library/db";
import log from "loglevel";
import asyncHandler from "express-async-handler";
import { SplitRecipient } from "@prisma/client";
import { formatError } from "../library/errors";

const create_split = asyncHandler(async (req, res, next) => {
  const { contentId, contentType, splits } = req.body;

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

export default {
  create_split,
};

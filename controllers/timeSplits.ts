import prisma from "../prisma/client";
import asyncHandler from "express-async-handler";
import { TimeSplit } from "@prisma/client";
import { formatError } from "../library/errors";
import { isContentOwner } from "../library/userHelper";

const create_time_splits = asyncHandler(async (req, res, next) => {
  const { contentId, contentType, timeSplits } = req.body;

  // Does user own this content?
  const userId = req["uid"];
  const isOwner = await isContentOwner(userId, contentId, contentType);
  if (!isOwner) {
    const error = formatError(403, "User does not own this content");
    next(error);
    return;
  }

  // Transform timeSplits into db format
  const newSplitsForDb = <TimeSplit[]>timeSplits.map((split) => {
    return {
      contentId: contentId,
      startSeconds: split.startSeconds,
      endSeconds: split.endSeconds,
      shareNumerator: split.shareNumerator,
      shareDenominator: split.shareDenominator,
      recipientContentId: split.recipientContentId,
    };
  });

  try {
    const splits = await prisma.timeSplit.createMany({
      data: newSplitsForDb,
    });

    res.status(200).json({ success: true, data: splits });
  } catch (e) {
    const error = formatError(500, `${e.code}: ${e.message}`);
    next(error);
    return;
  }
});

const get_time_splits = asyncHandler(async (req, res, next) => {
  const { contentId, contentType } = req.body;
  const userId = req["uid"];

  // Check where clause
  if (!contentId) {
    const error = formatError(400, "contentId is required");
    next(error);
    return;
  }

  // Does user own this content?
  const isOwner = await isContentOwner(userId, contentId, contentType);
  if (!isOwner) {
    const error = formatError(403, "User does not own this content");
    next(error);
    return;
  }

  try {
    const splits = await prisma.timeSplit.findMany({
      where: {
        contentId: contentId,
      },
    });

    res.status(200).json({ success: true, data: splits });
  } catch (e) {
    const error = formatError(500, `${e.code}: ${e.message}`);
    next(error);
    return;
  }
});

export default {
  create_time_splits,
  get_time_splits,
};

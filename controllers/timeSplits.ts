import prisma from "../prisma/client";
import asyncHandler from "express-async-handler";
import { formatError } from "../library/errors";
import {
  checkContentOwnership,
  validateTimeSplitRequest,
} from "../library/timeSplit";
import log from "loglevel";

const create_time_splits = asyncHandler(async (req, res, next) => {
  const newSplitsForDb = await validateTimeSplitRequest(req, res, next);

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
  const { contentId } = req.body;
  // Check where clause
  if (!contentId) {
    const error = formatError(400, "contentId is required");
    next(error);
    return;
  }

  // Does user own this content?
  await checkContentOwnership(req, res, next);

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

const update_time_splits = asyncHandler(async (req, res, next) => {
  const { contentId } = req.body;
  // Check where clause
  if (!contentId) {
    const error = formatError(400, "contentId is required");
    next(error);
    return;
  }

  // Delete splits if time split list is empty
  const timeSplits = req.body.timeSplits;
  if (Array.isArray(timeSplits) && timeSplits.length === 0) {
    log.debug(
      "timeSplit is empty, deleting all splits for contentId: ",
      contentId
    );
    try {
      const splits = await prisma.timeSplit.deleteMany({
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
  }

  const newSplitsForDb = await validateTimeSplitRequest(req, res, next, true);

  try {
    const splits = await prisma.timeSplit
      .deleteMany({
        where: {
          contentId: {
            equals: contentId,
          },
        },
      })
      .then(() => {
        return prisma.timeSplit.createMany({
          data: newSplitsForDb,
        });
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
  update_time_splits,
};

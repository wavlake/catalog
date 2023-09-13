import prisma from "../prisma/client";
import asyncHandler from "express-async-handler";
import { formatError } from "../library/errors";
import {
  contentHasTimeSplits,
  validateTimeSplitRequest,
} from "../library/timeSplit";
import { checkContentOwnership } from "../library/userHelper";
import log from "loglevel";

const create_time_splits = asyncHandler(async (req, res, next) => {
  await checkContentOwnership(req, res, next);
  const { contentId } = req.body;

  const hasTimeSplits = await contentHasTimeSplits(contentId);
  if (hasTimeSplits) {
    const error = formatError(
      400,
      "Time splits already exist for this content. Update instead of create."
    );
    next(error);
    return;
  }

  const newSplitsForDb = await validateTimeSplitRequest(req, res, next);

  if (newSplitsForDb) {
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
  }
});

const get_time_splits = asyncHandler(async (req, res, next) => {
  const { contentId, contentType } = req.params;

  if (!contentId || !contentType) {
    const error = formatError(
      400,
      "Must include both contentId and contentType"
    );
    next(error);
    return;
  }

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
  await checkContentOwnership(req, res, next);
  const { contentId } = req.body;

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

  if (newSplitsForDb) {
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
  }
});

export default {
  create_time_splits,
  get_time_splits,
  update_time_splits,
};

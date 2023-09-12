import { TimeSplit } from "@prisma/client";
import { formatError } from "../library/errors";
import { isContentOwner } from "../library/userHelper";

export async function checkContentOwnership(req, res, next) {
  const { contentId, contentType } = req.body;
  const userId = req["uid"];

  // Does user own this content?
  const isOwner = await isContentOwner(userId, contentId, contentType);
  if (!isOwner) {
    const error = formatError(403, "User does not own this content");
    next(error);
    return;
  }

  return true;
}

export async function hasNoOverlaps(
  requestedTimeSplits: Array<TimeSplit>
): Promise<Boolean> {
  requestedTimeSplits.sort((a, b) => {
    return a.startSeconds - b.startSeconds;
  });
  for (let i = 0; i < requestedTimeSplits.length - 1; i++) {
    if (
      requestedTimeSplits[i].endSeconds >=
      requestedTimeSplits[i + 1].startSeconds
    ) {
      return false;
    }
  }
  return true;
}

export async function validateTimeSplitRequest(
  req,
  res,
  next,
  isUpdate = false
) {
  const { contentId, contentType, timeSplits } = req.body;
  if (
    typeof contentId !== "string" ||
    typeof contentType !== "string" ||
    !Array.isArray(timeSplits)
  ) {
    const error = formatError(
      400,
      "contentId must be a string, contentType must be a string, and timeSplits must be an array"
    );
    next(error);
    return false;
  }

  const timeSplitsAreValid = timeSplits.every((split) => {
    return (
      typeof split.startSeconds === "number" &&
      typeof split.endSeconds === "number" &&
      typeof split.shareNumerator === "number" &&
      typeof split.shareDenominator === "number" &&
      split.shareNumerator > 1 &&
      split.shareNumerator <= split.shareDenominator &&
      typeof split.recipientContentId === "string"
    );
  });

  if (!timeSplitsAreValid) {
    const error = formatError(
      400,
      "Each time split must include a recipientContentId as string and startSeconds, endSeconds, shareNumerator, and shareDenominator as numbers."
    );
    next(error);
    return false;
  }

  // Check for overlaps
  if (isUpdate) {
    const overlapCheck = await hasNoOverlaps(timeSplits);
    if (!overlapCheck) {
      const error = formatError(
        400,
        "Time splits cannot overlap with one another."
      );
      next(error);
      return false;
    }
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

  return newSplitsForDb;
}

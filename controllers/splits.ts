import prisma from "../prisma/client";
import asyncHandler from "express-async-handler";
import { SplitRecipient } from "@prisma/client";
import { formatError } from "../library/errors";
import { SplitContentTypes, isContentOwner } from "../library/userHelper";

type ValidatedSplitReceipient = Partial<SplitRecipient> & {
  username?: string;
  error?: boolean;
};
// This function takes the frontend splits array and returns an array of validated splits that can be added to the db.
// It also validates that each split's username exists in the database, and retrieves the corresponding userId.

const parseSplitsAndValidateUsername = async (
  incomingSplits: Array<SplitRecipient & { name: string }>,
  next: any
): Promise<{ userId: string; share: number }[]> => {
  if (incomingSplits.length === 0) {
    const error = formatError(400, "Must include at least one split recipient");
    next(error);
    return;
  }
  const allSplitSharesAreValid = incomingSplits.every((split) => {
    return (
      !!split.share &&
      typeof split.share === "number" &&
      split.share > 0 &&
      // modulous 1 checks if the number is an integer
      split.share % 1 === 0
    );
  });
  if (!allSplitSharesAreValid) {
    const error = formatError(
      400,
      "Each split share must be a positive integer"
    );
    next(error);
    return;
  }

  const validatedSplits = await Promise.all<ValidatedSplitReceipient>(
    incomingSplits.map(async (split) => {
      const { name: username, share } = split;
      const hasValidData = username && share && typeof share === "number";

      // guard against invalid data
      if (!hasValidData) {
        return {
          share,
          username,
          error: true,
        };
      }
      const usernameMatch = await prisma.user.findFirst({
        where: {
          name: username,
        },
        select: {
          id: true,
        },
      });

      return {
        userId: usernameMatch?.id,
        share,
        username,
        error: !usernameMatch,
      };
    })
  );

  const invalidUserNames = validatedSplits
    .filter((split) => split.error)
    .map((split) => split.username);

  if (!!invalidUserNames.length) {
    const error = formatError(
      404,
      `Username${
        invalidUserNames.length === 1 ? "" : "s"
      } not found: "${invalidUserNames.join(`", "`)}"`
    );
    next(error);
    return [];
  }

  return validatedSplits.map((split) => {
    const { userId, share } = split;
    return {
      userId,
      share,
    };
  });
};

const create_split = asyncHandler(async (req, res, next) => {
  const { contentId, contentType, splitRecipients } = req.body;

  // Does user own this content?
  const userId = req["uid"];
  const isOwner = await isContentOwner(userId, contentId, contentType);
  if (!isOwner) {
    const error = formatError(403, "User does not own this content");
    next(error);
    return;
  }

  const newSplitsForDb = await parseSplitsAndValidateUsername(
    splitRecipients,
    next
  );
  if (!newSplitsForDb.length) {
    // parseSplitsAndValidateUsername will handle any invalid usernames
    // if an invalid username is found, next() is called with an error and an empty array is returned
    return;
  }

  try {
    const split = await prisma.split.create({
      data: {
        contentId: contentId,
        contentType: contentType,
        splitRecipients: {
          createMany: { data: newSplitsForDb },
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
    return;
  }
});

const get_split = asyncHandler(async (req, res, next) => {
  const { contentId, contentType } = req.params;
  const userId = req["uid"];

  // Does user own this content?
  const isOwner = await isContentOwner(
    userId,
    contentId,
    contentType as SplitContentTypes
  );

  if (!isOwner) {
    const error = formatError(403, "User does not own this content");
    next(error);
    return;
  }

  try {
    const split = await prisma.split.findFirst({
      where: {
        contentId: contentId,
        contentType: contentType,
      },
      include: {
        splitRecipients: {
          select: {
            share: true,
            user: {
              select: {
                name: true,
              },
            },
          },
        },
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

  if (!contentId || !contentType) {
    const error = formatError(
      400,
      "Must include both contentId and contentType"
    );
    next(error);
    return;
  }

  if (!isOwner) {
    const error = formatError(403, "User does not own this content");
    next(error);
    return;
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
    return;
  }

  const newSplitsForDb = await parseSplitsAndValidateUsername(
    splitRecipients,
    next
  );
  if (!newSplitsForDb.length) {
    return;
  }

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
          createMany: { data: newSplitsForDb },
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

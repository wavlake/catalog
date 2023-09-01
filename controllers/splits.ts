import prisma from "../prisma/client";
import asyncHandler from "express-async-handler";
import { SplitRecipient } from "@prisma/client";
import { formatError } from "../library/errors";
import { isContentOwner } from "../library/userHelper";
import { type } from "os";
type ValidatedSplitReceipient = Partial<SplitRecipient> & {
  username?: string;
  error?: boolean;
};

const parseSplitsAndValidateUsername = async (
  frontendSplits: any,
  next: any
): Promise<{ userId: string; share: number }[]> => {
  const validatedSplits = await Promise.all<ValidatedSplitReceipient>(
    frontendSplits.map(async (split) => {
      const { name: username, splitPercentage: share } = split;
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
      } not found: ${invalidUserNames.join(", ")}`
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
  const userId = req["uid"];

  // Does user own this content?
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
  const isOwner = await isContentOwner(userId, contentId, contentType);

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
    console.log("split not found");
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

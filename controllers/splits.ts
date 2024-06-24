import prisma from "../prisma/client";
import asyncHandler from "express-async-handler";
import { SplitRecipient } from "@prisma/client";
import { formatError } from "../library/errors";

const MAX_SPLIT_COUNT = 12;

type ValidatedSplitReceipient = Partial<SplitRecipient> & {
  username?: string;
  error?: boolean;
};
// This function takes the frontend splits array and returns an array of validated splits that can be added to the db.
// It also validates that each split's username exists in the database, and retrieves the corresponding userId.

const parseSplitsAndValidateUsername = async (
  incomingSplits: Array<SplitRecipient & { name: string }>,
  res: any
): Promise<{ userId: string; share: number }[]> => {
  if (incomingSplits.length === 0) {
    res.status(400).json({
      success: false,
      error: "Must include at least one split recipient",
    });
    return [];
  }

  if (incomingSplits.length > MAX_SPLIT_COUNT) {
    res.status(400).json({
      success: false,
      error: `Number of split recipients must be ${MAX_SPLIT_COUNT} or fewer`,
    });
    return [];
  }

  const uniqueUserNames = new Set(incomingSplits.map((split) => split.name));
  if (uniqueUserNames.size !== incomingSplits.length) {
    res.status(400).json({
      success: false,
      error:
        "Each split recipient must be unique, duplicate usernames are not allowed",
    });
    return [];
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
    res.status(400).json({
      success: false,
      error: "Each split share must be a positive integer",
    });
    return [];
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
    res.status(404).json({
      success: false,
      error: `Username${
        invalidUserNames.length === 1 ? "" : "s"
      } not found: "${invalidUserNames.join(`", "`)}"`,
    });
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

  const newSplitsForDb = await parseSplitsAndValidateUsername(
    splitRecipients,
    res
  );

  if (!newSplitsForDb.length) {
    // parseSplitsAndValidateUsername will handle any invalid usernames and error responses
    // if an invalid username is found, an empty array is returned
    return;
  }

  const existingSplit = await prisma.split.findFirst({
    where: {
      contentId: contentId,
      contentType: contentType,
    },
  });

  if (existingSplit) {
    res.status(400).json({
      success: false,
      error: "Split already exists for this content, please update it instead.",
    });
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

  if (!contentId || !contentType) {
    res.status(400).json("Must include both contentId and contentType");
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

  if (!contentId || !contentType) {
    res.status(400).json("Must include both contentId and contentType");
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
    res.status(404).json("Split not found");
    return;
  }

  const newSplitsForDb = await parseSplitsAndValidateUsername(
    splitRecipients,
    res
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

const check_usernames = asyncHandler(async (req, res, next) => {
  const { usernames } = req.body;

  if (!usernames || !usernames.length) {
    res.status(400).json({
      success: false,
      error: "Must include at least one username",
    });
    return;
  }

  const usernameMatches = await prisma.user.findMany({
    where: {
      name: {
        in: usernames,
      },
    },
    select: {
      name: true,
    },
  });

  const foundUsernames = usernameMatches.map((user) => user.name);
  const notFoundUsernames = usernames.filter(
    (username) => !foundUsernames.includes(username)
  );

  // return the list of usernames with an isValid flag
  const response = usernames.map((username) => {
    return {
      username,
      isValid: !notFoundUsernames.includes(username),
    };
  });
  res.status(200).json({ success: true, data: response });
});

export default {
  create_split,
  get_split,
  update_split,
  check_usernames,
};

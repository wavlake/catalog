import log from "../library/logger";
import Sentry from "@sentry/node";
import asyncHandler from "express-async-handler";
import { formatError } from "../library/errors";
import prisma from "../prisma/client";

const ADMIN_FLAG_ID = 1;
/**
 * Middleware to check if a user has admin privileges
 * Works by checking if the user has a flag with value 1 in the user_flag table
 */
export const isAdmin = asyncHandler(async (req, res, next) => {
  log.info("Checking if user is an admin");
  const userId = req["uid"];
  try {
    // First, verify the user is authenticated using Firebase
    if (!userId) return next(formatError(401, "Authentication failed"));

    // Check if the user has the admin flag (flag with id 1)
    const adminFlag = await prisma.userFlag.findFirst({
      where: {
        userId: userId,
        featureFlagId: ADMIN_FLAG_ID,
      },
    });

    if (!adminFlag) {
      return next(
        formatError(403, "Insufficient permissions: admin access required")
      );
    }

    // User is authenticated and has admin privileges
    next();
  } catch (err) {
    log.error(`isAdmin middleware error: ${err}`);
    Sentry?.captureException(err);
    next(formatError(500, "Admin authorization failed"));
  }
});

/**
 * A more flexible version that can check for any feature flag
 */
export const hasFeatureFlag = (flagId) => {
  return asyncHandler(async (req, res, next) => {
    const userId = req["user"];

    try {
      if (!userId) return next(formatError(401, "Authentication failed"));

      // Check if the user has the specified feature flag
      const userFlag = await prisma.userFlag.findFirst({
        where: {
          userId: userId,
          featureFlagId: flagId,
        },
      });

      if (!userFlag) {
        return next(
          formatError(
            403,
            `Insufficient permissions: required feature flag not found`
          )
        );
      }

      // User is authenticated and has the required feature flag
      next();
    } catch (err) {
      log.error(`hasFeatureFlag middleware error: ${err}`);
      Sentry?.captureException(err);
      next(formatError(500, "Feature flag authorization failed"));
    }
  });
};

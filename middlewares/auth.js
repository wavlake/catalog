const log = require("loglevel");
const { auth } = require("../library/firebaseService");
const Sentry = require("@sentry/node");

import { formatError } from "../library/errors";
import asyncHandler from "express-async-handler";

export const isAuthorized = asyncHandler(async (req, res, next) => {
  let authToken;
  if (
    req.headers.authorization &&
    req.headers.authorization.split(" ")[0] === "Bearer"
  ) {
    try {
      authToken = req.headers.authorization.split(" ")[1];
    } catch (err) {
      const error = formatError(
        500,
        "Authentication failed, error parsing token"
      );
      throw error;
    }
  } else {
    const error = formatError(500, "Missing authorization token");
    throw error;
  }

  await auth()
    .verifyIdToken(authToken)
    .then((user) => {
      req["uid"] = user.uid;
      req.params.uid = user.uid;
      next();
    })
    .catch((err) => {
      Sentry.captureException(err);
      const error = formatError(500, "Authentication failed");
      throw error;
    });
});

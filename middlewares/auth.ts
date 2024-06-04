import { auth } from "../library/firebaseService";
import Sentry from "@sentry/node";

import { formatError } from "../library/errors";
import asyncHandler from "express-async-handler";

export const isFirebaseAuthorized = async (req) => {
  let authToken;
  if (
    req.headers.authorization &&
    req.headers.authorization.split(" ")[0] === "Bearer"
  ) {
    try {
      authToken = req.headers.authorization.split(" ")[1];
    } catch (err) {
      return Promise.reject("Authentication failed, error parsing token");
    }
  } else {
    return Promise.reject("Missing authorization token");
  }

  try {
    const user = await auth().verifyIdToken(authToken);
    req.uid = user.uid;
    req.params.uid = user.uid;
    return user;
  } catch (err) {
    return Promise.reject("Authentication failed");
  }
};

export const isAuthorized = asyncHandler(async (req, res, next) => {
  try {
    const user = await isFirebaseAuthorized(req);
    if (!user) return next(formatError(500, "Authentication failed"));
    next();
  } catch (err) {
    Sentry?.captureException(err);
    next(err);
  }
});

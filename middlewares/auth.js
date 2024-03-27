const { auth } = require("../library/firebaseService");
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
      next({
        status: 500,
        message: "Authentication failed, error parsing token",
      });
      return;
    }
  } else {
    next({ status: 500, message: "Missing authorization token" });
    return;
  }

  await auth()
    .verifyIdToken(authToken)
    .then((user) => {
      req["uid"] = user.uid;
      req.params.uid = user.uid;
      next();
    })
    .catch((err) => {
      next({ status: 403, message: "Authentication failed" });
    });
});

import asyncHandler from "express-async-handler";

export const isNostrAuthorized = asyncHandler(async (req, res, next) => {
  next();
});

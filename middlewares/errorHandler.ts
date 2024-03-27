const log = require("loglevel");
import { NextFunction, Response, Request } from "express";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { FirebaseError } from "firebase-admin";
const Sentry = require("@sentry/node");

const errorMessageMap = {
  404: "Not found",
  403: "Forbidden",
  500: "Internal server error",
};

// https://www.prisma.io/docs/reference/api-reference/error-reference
export const errorHandler = (
  error: PrismaClientKnownRequestError | FirebaseError | any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = error.status || 500;
  const defaultMessage =
    typeof error === "string" ? error : errorMessageMap[statusCode];
  const errorMessage = error.meta?.message || error.message || defaultMessage;

  log.error(`${error}`);
  Sentry.captureException(error);
  res.status(statusCode).json({
    success: false,
    data: null,
    error: errorMessage,
  });
};

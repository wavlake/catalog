const log = require("loglevel");
import { NextFunction, Response, Request } from "express";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { FirebaseError } from "firebase-admin";
import { Prisma } from "@sentry/node/types/tracing/integrations";
const Sentry = require("@sentry/node");

// https://www.prisma.io/docs/reference/api-reference/error-reference
export const errorHandler = (
  error: PrismaClientKnownRequestError | FirebaseError | any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  log.error(`${error}`);
  Sentry.captureException(error);
  res.status(error.status || 500).json({
    success: false,
    data: null,
    error: error.meta?.message || error.message || error,
  });
};

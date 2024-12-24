import log from "../library/winston";
import { NextFunction, Response, Request } from "express";
import { Prisma } from "@prisma/client";
import { FirebaseError } from "firebase-admin";
import Sentry from "@sentry/node";

// https://www.prisma.io/docs/reference/api-reference/error-reference
export const errorHandler = (
  error: Prisma.PrismaClientKnownRequestError | FirebaseError | any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  log.error(`${error}`);
  Sentry?.captureException(error);
  res.status(error.status || 500).json({
    success: false,
    data: null,
    error: error.meta?.message || error.message || error,
  });
};

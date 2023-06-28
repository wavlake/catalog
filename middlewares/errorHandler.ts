import { NextFunction, Response, Request } from "express";
import { wavlakeErrorHandler } from "../library/errorHandler";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";

// https://www.prisma.io/docs/reference/api-reference/error-reference
export const errorHandler = (
  error: PrismaClientKnownRequestError | any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  wavlakeErrorHandler(error);
  res.status(error.status || 500).json({ error });
};

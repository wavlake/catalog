import { NextFunction, Response, Request } from "express";
import { wavlakeErrorHandler } from "../library/errorHandler";

export const errorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  wavlakeErrorHandler(error);
  res.status(error.status || 500).json({ error });
};

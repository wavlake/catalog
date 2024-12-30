import { NextFunction, Response, Request } from "express";
import log from "../library/winston";
export const logger = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === "OPTIONS" || process.env.NODE_ENV !== "dev") {
    next();
    return;
  }

  log.info(`${req.method} ${req.originalUrl}`);
  !!Object.entries(req.body).length && log.info(req.body);

  next();
};

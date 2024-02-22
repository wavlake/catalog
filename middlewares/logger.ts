import { NextFunction, Response, Request } from "express";
import log from "loglevel";
export const logger = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === "OPTIONS" || process.env.NODE_ENV !== "dev") {
    next();
    return;
  }

  log.debug(`${req.method} ${req.originalUrl}`);
  !!Object.entries(req.body).length && log.debug(req.body);

  next();
};

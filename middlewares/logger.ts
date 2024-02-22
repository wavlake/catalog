import { NextFunction, Response, Request } from "express";

export const logger = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === "OPTIONS" || process.env.NODE_ENV !== "dev") {
    next();
    return;
  }

  console.log(`${req.method} ${req.originalUrl}`);
  !!Object.entries(req.body).length && console.log(req.body);

  next();
};

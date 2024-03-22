import asyncHandler from "express-async-handler";
import log from "loglevel";
import { getProductionIps, isSupportedRegion } from "../library/zbd";

const environment = process.env.NODE_ENV;
const ZBD_IPS = ["3.225.112.64"];

// This middleware is used to check if the IP address of callbacks is coming
// from an authorized ZBD IP. If it is, we will allow the request to continue.
export const isZbdIp = asyncHandler(async (req, res, next) => {
  const ipAddress = req.ip;
  // const ips = await getProductionIps(); // Use in case of update
  const ips = ZBD_IPS;

  if (ips.includes(ipAddress)) {
    next();
    return;
  } else {
    res
      .status(401)
      .send({ error: "IP address of request does not match authorized list" });
  }
});

// This middleware is used to check if the IP address of the request is coming
// from a supported region. If it is, we will allow the request to continue.
export const isZbdRegion = asyncHandler(async (req, res, next) => {
  // Skip this check in dev
  if (environment === "dev") {
    next();
    return;
  }
  const ipAddress = req.ip;
  log.debug(`Checking if ${ipAddress} is supported`);
  const isSupported = await isSupportedRegion(ipAddress);
  if (isSupported) {
    next();
    return;
  } else {
    res.status(403).send({ error: "Not supported region" });
    return;
  }
});

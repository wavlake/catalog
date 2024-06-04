import express from "express";
const { isAuthorized } = require("@middlewares/auth");
const { isZbdRegion } = require("@middlewares/zbdChecks");
import withdrawController from "../controllers/withdraw";
const { rateLimit } = require("express-rate-limit");
const { isWalletVerified } = require("@middlewares/zbdChecks");

const env = process.env.NODE_ENV || "dev";
const rateTimeWindow = env === "dev" ? 5000 : 1 * 60 * 1000; // 5 seconds in dev, 1 minute in prod

// Create router
const router = express.Router();

// Rate limit
const limiter = rateLimit({
  windowMs: rateTimeWindow,
  max: 1, // Limit each user to 1 requests per `window` (here, per 1 minute)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers,
  keyGenerator: (req, res) => req["uid"],
});

//////// ROUTES ////////

router.post(
  "/",
  isAuthorized,
  isWalletVerified,
  limiter,
  isZbdRegion,
  withdrawController.createWithdraw
);

// Export router
export default router;

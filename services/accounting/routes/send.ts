import express from "express";
const { isAuthorized } = require("@middlewares/auth");
import sendController from "../controllers/send";
const { isWalletVerified } = require("@middlewares/zbdChecks");
const { rateLimit } = require("express-rate-limit");

const env = process.env.NODE_ENV || "dev";
const rateTimeWindow = env === "dev" ? 1000 : 5000; // 1 seconds in dev, 5 seconds in prod

// Create router
const router = express.Router();

// Rate limit
const limiter = rateLimit({
  windowMs: rateTimeWindow,
  max: 1, // Limit each user to 1 requests per `window` (here, per 5 seconds)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers,
  keyGenerator: (req, res) => req["uid"],
});

//////// ROUTES ////////

router.post(
  "/keysend",
  isAuthorized,
  limiter,
  isWalletVerified,
  sendController.sendKeysend
);
router.post("/", isAuthorized, limiter, sendController.createSend);

// Export router
export default router;

import express from "express";
const { isAuthorized } = require("@middlewares/auth");
import promoController from "../controllers/promo";
import { isZbdRegion } from "@middlewares/zbdChecks";
const { isWalletVerified } = require("@middlewares/zbdChecks");
const { rateLimit } = require("express-rate-limit");

const env = process.env.NODE_ENV || "dev";
// This limit is set to allow only 1 requests per 58 second window to prevent abuse.
const rateTimeWindow = env === "dev" ? 2000 : 58000; // 10 seconds in dev, 58000 seconds in prod

// Create router
const router = express.Router();

// User rate limit
const limiter = rateLimit({
  windowMs: rateTimeWindow,
  max: 1, // Limit each user to 1 requests per `window`
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers,
  keyGenerator: (req, res) => req["uid"],
});

// IP rate limit
const iplimiter = rateLimit({
  windowMs: rateTimeWindow,
  max: 1, // Limit each user to 1 requests per `window`
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers,
});

//////// ROUTES ////////

// router.post(
//   "/reward",
//   isAuthorized,
//   limiter,
//   iplimiter,
//   isWalletVerified,
//   promoController.createPromoReward
// );

// router.post(
//   "/create",
//   isAuthorized,
//   limiter,
//   iplimiter,
//   promoController.createPromo
// );

router.get("/battery", isAuthorized, promoController.getBatteryInfo);

router.post(
  "/battery",
  isAuthorized,
  isWalletVerified,
  isZbdRegion,
  promoController.createBatteryReward
);

// Export router
export default router;

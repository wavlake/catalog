import express from "express";
const { isAuthorized } = require("@middlewares/auth");
import promoController from "../controllers/promo";
const { isWalletVerified } = require("@middlewares/zbdChecks");
const { rateLimit } = require("express-rate-limit");

const env = process.env.NODE_ENV || "dev";
// This limit is set to allow only 1 request per minute, with some wiggle room
const rateTimeWindow = env === "dev" ? 2000 : 28000; // 10 seconds in dev, 28000 seconds in prod

// Create router
const router = express.Router();

// Rate limit
const limiter = rateLimit({
  windowMs: rateTimeWindow,
  max: 1, // Limit each user to 1 requests per `window`
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers,
  keyGenerator: (req, res) => req["uid"],
});

//////// ROUTES ////////

router.post(
  "/reward",
  isAuthorized,
  limiter,
  isWalletVerified,
  promoController.createPromoReward
);
router.put("/reward", isAuthorized, limiter, promoController.updatePromoReward);

// Export router
export default router;

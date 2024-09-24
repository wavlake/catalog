import express from "express";
const { isAuthorized } = require("@middlewares/auth");
import promoController from "../controllers/promo";
const { isWalletVerified } = require("@middlewares/zbdChecks");
const { rateLimit } = require("express-rate-limit");

const env = process.env.NODE_ENV || "dev";
// This limit is set to allow only 2 requests per 28 second window
// This allows a client to create a promo reward, update it, and then create another one every minute-ish
// But that's it. This is to prevent abuse.
const rateTimeWindow = env === "dev" ? 2000 : 28000; // 10 seconds in dev, 28000 seconds in prod

// Create router
const router = express.Router();

// Rate limit
const limiter = rateLimit({
  windowMs: rateTimeWindow,
  max: 2, // Limit each user to 1 requests per `window`
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

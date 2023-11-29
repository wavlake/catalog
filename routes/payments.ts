import express from "express";
const { isAuthorized } = require("../middlewares/auth");
const { isZbdIp, isZbdRegion } = require("../middlewares/zbdChecks");
import paymentsController from "../controllers/payments";
const { rateLimit } = require("express-rate-limit");

// Create router
const router = express.Router();

// Rate limit
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1, // Limit each user to 1 requests per `window` (here, per 1 minute)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers,
  keyGenerator: (req, res) => req["uid"],
});

//////// ROUTES ////////

router.post(
  "/create-payment",
  isAuthorized,
  limiter,
  isZbdRegion,
  paymentsController.createPayment
);
router.post("/callback/zbd", isZbdIp, paymentsController.zbdCallback);

// Export router
export default router;

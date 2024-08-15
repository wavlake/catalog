import express from "express";
import depositController from "../controllers/deposit";
import { isAuthorized } from "@middlewares/auth";
import { isWalletVerified } from "@middlewares/zbdChecks";
import { isAPITokenAuthorized } from "@middlewares/isAPITokenAuthorized";
const { rateLimit } = require("express-rate-limit");

// Create router
const router = express.Router();

// Rate limit
const rateTimeWindow = 10000; // 10 seconds
const limiter = rateLimit({
  windowMs: rateTimeWindow,
  max: 2, // Limit each lnurl address to this many requests per `window`
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers,
  keyGenerator: (req, res) => req.body.userId,
});

//////// ROUTES ////////

router.post(
  "/",
  isAuthorized,
  isWalletVerified,
  depositController.createDeposit
);

router.post(
  "/lnurl",
  isAPITokenAuthorized,
  isWalletVerified,
  limiter,
  depositController.createDepositLNURL
);

router.get("/:id", isAuthorized, depositController.getDeposit);

// Export router
export default router;

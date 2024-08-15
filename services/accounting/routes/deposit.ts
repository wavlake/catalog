import express from "express";
import depositController from "../controllers/deposit";
import { isAuthorized } from "@middlewares/auth";
import { isWalletVerified } from "@middlewares/zbdChecks";
import { isAPITokenAuthorized } from "@middlewares/isAPITokenAuthorized";

// Create router
const router = express.Router();

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
  depositController.createDepositLNURL
);

router.get("/:id", isAuthorized, depositController.getDeposit);

// Export router
export default router;

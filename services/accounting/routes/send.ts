import express from "express";
import { isAuthorized } from "@middlewares/auth";
import sendController from "../controllers/send";
const { isWalletVerified } = require("@middlewares/zbdChecks");

// Create router
const router = express.Router();

//////// ROUTES ////////

router.post(
  "/keysend",
  isAuthorized,
  isWalletVerified,
  sendController.sendKeysend
);
router.post("/", isAuthorized, sendController.createSend);

// Export router
export default router;

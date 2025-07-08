import express from "express";
import rampWidgetController from "../controllers/ramp-widget";
import { isAuthorized } from "@middlewares/auth";
import { isWalletVerified } from "@middlewares/zbdChecks";
import { isZbdIp } from "@middlewares/isZbdIp";

// Create router
const router = express.Router();

//////// ROUTES ////////

// Create new ramp widget session
router.post(
  "/",
  isAuthorized,
  isWalletVerified,
  rampWidgetController.createRampSession,
);

// Get ramp widget session status
router.get("/:sessionId", isAuthorized, rampWidgetController.getRampSession);

// Handle ZBD Pay webhooks (no auth required, verified by ZBD IP)
router.post("/callback", isZbdIp, rampWidgetController.handleRampCallback);

// Export router
export default router;

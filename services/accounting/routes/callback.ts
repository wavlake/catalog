import express from "express";
import callbackController from "../controllers/callback";
const { isZbdIp } = require("@middlewares/zbdChecks");

// Create router
const router = express.Router();

//////// ROUTES ////////

router.post(
  "/receive/keysend",
  isZbdIp,
  callbackController.processIncomingKeysend
);
router.post(
  "/send/keysend",
  isZbdIp,
  callbackController.processOutgoingKeysend
);
router.post(
  "/receive/invoice",
  isZbdIp,
  callbackController.processIncomingInvoice
);
router.post(
  "/send/invoice",
  isZbdIp,
  callbackController.processOutgoingInvoice
);

router.post(
  "/battery/send/invoice",
  isZbdIp,
  callbackController.processOutgoingBatteryInvoice
);

router.post(
  "/battery/receive/invoice",
  isZbdIp,
  callbackController.processIncomingBatteryInvoice
);
// Export router
export default router;

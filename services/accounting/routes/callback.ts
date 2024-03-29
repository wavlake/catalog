import express from "express";
import callbackController from "../controllers/callback";
const { isZbdIp } = require("@middlewares/zbdChecks");

// Create router
const router = express.Router();

//////// ROUTES ////////

// TODO: Add ZBD IP check to all these routes
// router.post(
//   "/receive/keysend",
//   isZbdIp,
//   callbackController.processIncomingKeysend
// );
// router.post(
//   "/send/keysend",
//   isZbdIp,
//   callbackController.processOutgoingKeysend
// );
// router.post(
//   "/receive/invoice",
//   isZbdIp,
//   callbackController.processIncomingInvoice
// );
router.post(
  "/send/invoice",
  isZbdIp,
  callbackController.processOutgoingInvoice
);

// Export router
export default router;

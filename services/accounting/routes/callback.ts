import express from "express";
import callbackController from "../controllers/callback";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.post("/receive/keysend", callbackController.processIncomingKeysend);
router.post("/send/keysend", callbackController.processOutgoingKeysend);
router.post("/receive/invoice", callbackController.processIncomingInvoice);
router.post("/send/invoice", callbackController.processOutgoingInvoice);

// Export router
export default router;

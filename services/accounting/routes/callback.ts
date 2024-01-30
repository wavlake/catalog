import express from "express";
import callbackController from "../controllers/callback";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.post("/keysend", callbackController.processIncomingKeysend);
router.post("/invoice", callbackController.updateInvoice);

// Export router
export default router;

import express from "express";
const { isAuthorized } = require("@middlewares/auth");
const { isZbdRegion } = require("@middlewares/zbdChecks");
import invoiceController from "../controllers/invoice";

// Create router
const router = express.Router();

//////// ROUTES ////////

// used by clients to long pull the invoice status
// so the client can update the UI when the invoice is paid
router.get("/:id", invoiceController.getInvoice);
// ZBD callback to notify us of invoice updates
router.post("/update", invoiceController.updateInvoice);
// used by clients to create a new invoice
router.post("/", isAuthorized, isZbdRegion, invoiceController.createInvoice);

// Export router
export default router;

import express from "express";
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
router.post("/", invoiceController.createInvoice);

// Export router
export default router;

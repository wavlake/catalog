import express from "express";
import invoiceController from "../controllers/invoice";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get("/:id", invoiceController.getInvoice);
router.post("/update", invoiceController.updateInvoice);
router.post("/", invoiceController.createInvoice);

// Export router
export default router;

import express from "express";
import invoiceController from "../controllers/invoice";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get("/:id", invoiceController.getInvoice);

// Export router
export default router;

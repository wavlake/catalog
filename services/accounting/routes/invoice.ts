import express from "express";
const { isAuthorized } = require("@middlewares/auth");
const { isZbdRegion } = require("@middlewares/zbdChecks");
import invoiceController from "../controllers/invoice";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get("/zap", isZbdRegion, invoiceController.createZapInvoice);
router.post("/", isAuthorized, isZbdRegion, invoiceController.createInvoice);

// Export router
export default router;

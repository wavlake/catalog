import express from "express";
const { isAuthorized } = require("../middlewares/auth");
const { isZbdIp, isZbdRegion } = require("../middlewares/zbdChecks");
import paymentsController from "../controllers/payments";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.post(
  "/create-payment",
  isAuthorized,
  isZbdRegion,
  paymentsController.createPayment
);
router.post("/callback/zbd", isZbdIp, paymentsController.zbdCallback);

// Export router
export default router;

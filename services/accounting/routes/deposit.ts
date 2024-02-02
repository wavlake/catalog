import express from "express";
import depositController from "../controllers/deposit";
const { isAuthorized } = require("@middlewares/auth");
const { isZbdIp, isZbdRegion } = require("@middlewares/zbdChecks");
const { rateLimit } = require("express-rate-limit");

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get("/:transactionId", isAuthorized, depositController.getDeposit);
router.post("/", isAuthorized, depositController.createDeposit);

// Export router
export default router;

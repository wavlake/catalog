import express from "express";
import depositController from "../controllers/deposit";
const { isAuthorized } = require("@middlewares/auth");
const { isZbdRegion } = require("@middlewares/zbdChecks");

// Create router
const router = express.Router();

//////// ROUTES ////////

router.post("/", isAuthorized, isZbdRegion, depositController.createDeposit);

// Export router
export default router;

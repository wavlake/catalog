import express from "express";
import { isAuthorized } from "@middlewares/auth";
import { isZbdIp, isZbdRegion } from "@middlewares/zbdChecks";
import { rateLimit } from "express-rate-limit";
import sendController from "controllers/send";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.post("/keysend", sendController.sendKeysend);
router.post("/", isAuthorized, sendController.createSend);

// Export router
export default router;

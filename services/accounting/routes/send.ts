import express from "express";
import { isAuthorized } from "@middlewares/auth";
import sendController from "controllers/send";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.post("/keysend", isAuthorized, sendController.sendKeysend);
router.post("/", isAuthorized, sendController.createSend);

// Export router
export default router;

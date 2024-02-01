import sendController from "../controllers/send";
import express from "express";
const { isAuthorized } = require("@middlewares/auth");
const { isZbdIp, isZbdRegion } = require("@middlewares/zbdChecks");
const { rateLimit } = require("express-rate-limit");
// Create router
const router = express.Router();

//////// ROUTES ////////

router.post("/keysend", sendController.sendKeysend);

// Export router
export default router;

import express from "express";
const { isAuthorized } = require("@middlewares/auth");
import sendController from "controllers/send";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.post("/", isAuthorized, sendController.createSend);

// Export router
export default router;

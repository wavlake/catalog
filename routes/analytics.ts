const express = require("express");
const { isAuthorized } = require("../middlewares/auth");

// Import controllers
import analyticsController from "../controllers/analytics";

// Create router
const router = express.Router();

//////// ROUTES ////////
router.get("/stats", analyticsController.get_stats);
router.get("/earnings", isAuthorized, analyticsController.get_earnings);

// Export router
export default router;

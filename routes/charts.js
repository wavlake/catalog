const express = require("express");
// Import controllers
import chartsController from "../controllers/charts";

// Create router
const router = express.Router();

//////// ROUTES ////////

/// MUSIC CHARTS ///

router.get("/music/top", chartsController.get_top_forty); // TOP 40

// Export router
export default router;

const express = require("express");
// Import controllers
import chartsController from "../controllers/charts";

// Create router
const router = express.Router();

//////// ROUTES ////////

/// MUSIC CHARTS ///

router.get("/music/top", chartsController.get_top_forty); // TOP 40
router.get("/music/beta_top", chartsController.get_beta_top_forty); // BETA TOP 40
router.get("/music/custom", chartsController.get_custom_chart); // CUSTOM CHART

// Export router
export default router;

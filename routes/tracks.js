const express = require("express");

// Import controllers
import tracksController from "../controllers/tracks.js";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get("/top", tracksController.get_index_top); // TOP 40

router.get("/:trackId", tracksController.get_track); // TOP 40

// Export router
module.exports = router;

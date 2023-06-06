const express = require("express");

// Import controllers
const tracksController = require("../controllers/tracks.js");

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get("/top", tracksController.get_index_top); // TOP 40

// Export router
module.exports = router;

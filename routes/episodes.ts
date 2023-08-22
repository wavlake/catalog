const express = require("express");
const { isAuthorized } = require("../middlewares/auth.js");

// Import controllers
import episodesController from "../controllers/episodes";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get("/account", isAuthorized, episodesController.get_tracks_by_account);

// Export router
export default router;

const express = require("express");
const { isAuthorized } = require("../middlewares/auth");

// Import controllers
import commentsController from "../controllers/comments";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get("/episode/:id", commentsController.get_episode_comments);
router.get("/track/:id", commentsController.get_track_comments);

// Export router
export default router;

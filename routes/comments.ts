import express from "express";
import commentsController from "../controllers/comments";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get("/:id", commentsController.get_comments);
router.get("/show/:id", commentsController.get_podcast_comments);
router.get("/artist/:id", commentsController.get_artist_comments);

// Export router
export default router;

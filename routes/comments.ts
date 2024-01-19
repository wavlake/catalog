import express from "express";
import commentsController from "../controllers/comments";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get("/:id", commentsController.get_comments);
router.get("/show/:id", commentsController.get_podcast_comments);
router.get(
  "/artist/:id/:page/:pageSize",
  commentsController.get_artist_comments
);
router.get(
  "/artist-url/:artistUrl/:page/:pageSize",
  commentsController.get_artist_url_comments
);

// Export router
export default router;

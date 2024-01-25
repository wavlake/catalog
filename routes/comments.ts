import express from "express";
import commentsController from "../controllers/comments";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get("/:contentId/:page?/:pageSize?", commentsController.get_comments);
router.get(
  "/show/:podcastId/:page?/:pageSize?",
  commentsController.get_podcast_comments
);
router.get(
  "/artist/:artistId/:page?/:pageSize?",
  commentsController.get_artist_comments
);
router.get(
  "/album/:albumId/:page?/:pageSize?",
  commentsController.get_album_comments
);

// Export router
export default router;

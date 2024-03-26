import express from "express";
import commentsController from "../controllers/comments";
import { validatePaginationAndId } from "../middlewares/validatePagination";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get(
  "/show/:podcastId/:page?/:pageSize?",
  validatePaginationAndId("podcastId"),
  commentsController.get_podcast_comments
);
router.get(
  "/artist/:artistId/:page?/:pageSize?",
  validatePaginationAndId("artistId"),
  commentsController.get_artist_comments
);
router.get(
  "/album/:albumId/:page?/:pageSize?",
  validatePaginationAndId("albumId"),
  commentsController.get_album_comments
);

// this must be last so that contentId doesn't match the other routes
router.get(
  "/:contentId/:page?/:pageSize?",
  validatePaginationAndId("contentId"),
  commentsController.get_comments
);
// Export router
export default router;

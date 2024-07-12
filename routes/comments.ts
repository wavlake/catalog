import express from "express";
import commentsController from "../controllers/comments";
import { validatePaginationAndId } from "../middlewares/validatePagination";
import { isFirebaseOrNostrAuthorized } from "../middlewares/firebaseOrNostrAuth";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get("/id/:commentId", commentsController.get_comment_by_id);
router.put(
  "/event-id/:zapRequestEventId/:kind1EventId",
  isFirebaseOrNostrAuthorized,
  commentsController.update_event_id
);

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

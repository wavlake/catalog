import express from "express";
import { isAuthorized } from "../middlewares/auth";

// Import controllers
import {
  get_episode,
  get_episodes_by_account,
  get_episodes_by_podcast_id,
  delete_episode,
  create_episode,
  update_episode,
  get_new_episodes,
  get_featured_episodes,
} from "../controllers/episodes";

// Create router
const router = express.Router();

//////// ROUTES ////////

// queries
router.get("/account", isAuthorized, get_episodes_by_account);
router.get("/new", get_new_episodes);
router.get("/featured", get_featured_episodes);
router.get("/:podcastId/podcast", get_episodes_by_podcast_id);
router.get("/:episodeId", get_episode);

// mutations
router.post("/", isAuthorized, create_episode);
router.put("/update", isAuthorized, update_episode);
router.delete("/:episodeId", isAuthorized, delete_episode);

// Export router
export default router;

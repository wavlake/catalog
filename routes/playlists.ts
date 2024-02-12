import express from "express";
import {
  addTrackToPlaylist,
  getPlaylist,
  createPlaylist,
} from "../controllers/playlists";
import { isNostrAuthorized } from "../middlewares/nostrAuth";

// Create router
const router = express.Router();

//////// ROUTES ////////

// queries
router.get("/:id", getPlaylist);

// mutations
router.post("/add-track", isNostrAuthorized, addTrackToPlaylist);
router.post("/", isNostrAuthorized, createPlaylist);

// Export router
export default router;

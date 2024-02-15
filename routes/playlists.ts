import express from "express";
import {
  addTrackToPlaylist,
  getPlaylist,
  createPlaylist,
  deletePlaylist,
  removeTrackFromPlaylist,
  reorderPlaylist,
} from "../controllers/playlists";
import { isNostrAuthorized } from "../middlewares/nostrAuth";

// Create router
const router = express.Router();

//////// ROUTES ////////

// queries
router.get("/:id", getPlaylist);

// mutations
router.post("/add-track", isNostrAuthorized, addTrackToPlaylist);
router.post("/remove-track", isNostrAuthorized, removeTrackFromPlaylist);
router.post("/", isNostrAuthorized, createPlaylist);
router.delete("/:id", isNostrAuthorized, deletePlaylist);
router.post("/reorder", isNostrAuthorized, reorderPlaylist);

// Export router
export default router;

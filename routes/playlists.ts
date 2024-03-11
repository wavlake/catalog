import express from "express";
import {
  addTrackToPlaylist,
  getPlaylist,
  createPlaylist,
  deletePlaylist,
  removeTrackFromPlaylist,
  reorderPlaylist,
  getUserPlaylists,
  updatePlaylist,
} from "../controllers/playlists";
import { isNostrAuthorized } from "../middlewares/nostrAuth";

// Create router
const router = express.Router();

//////// ROUTES ////////

// queries
router.get("/:id", getPlaylist);
router.get("/", isNostrAuthorized, getUserPlaylists);

// mutations
router.post("/add-track", isNostrAuthorized, addTrackToPlaylist);
router.post("/remove-track", isNostrAuthorized, removeTrackFromPlaylist);
router.post("/", isNostrAuthorized, createPlaylist);
router.delete("/:id", isNostrAuthorized, deletePlaylist);
router.post("/reorder", isNostrAuthorized, reorderPlaylist);
router.put("/:id", isNostrAuthorized, updatePlaylist);

// Export router
export default router;

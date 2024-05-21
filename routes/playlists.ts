import express from "express";
import {
  addTrackToPlaylist,
  getPlaylist,
  createPlaylist,
  deletePlaylist,
  removeTrackFromPlaylist,
  reorderPlaylist,
  getUserPlaylists,
} from "../controllers/playlists";
import { isFirebaseOrNostrAuthorized } from "../middlewares/firebaseOrNostrAuth";

// Create router
const router = express.Router();

//////// ROUTES ////////

// queries
router.get("/:id", getPlaylist);
router.get("/", isFirebaseOrNostrAuthorized, getUserPlaylists);
// public route?
router.get("/user/:id", getUserPlaylists);

// mutations
router.post("/add-track", isFirebaseOrNostrAuthorized, addTrackToPlaylist);
router.post(
  "/remove-track",
  isFirebaseOrNostrAuthorized,
  removeTrackFromPlaylist
);
router.post("/", isFirebaseOrNostrAuthorized, createPlaylist);
router.delete("/:id", isFirebaseOrNostrAuthorized, deletePlaylist);
router.post("/reorder", isFirebaseOrNostrAuthorized, reorderPlaylist);

// Export router
export default router;

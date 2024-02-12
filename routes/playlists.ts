import express from "express";
import { getPlaylists, createPlaylist } from "../controllers/playlists";
import { isNostrAuthorized } from "../middlewares/nostrAuth";

// Create router
const router = express.Router();

//////// ROUTES ////////

// queries
router.get("/:id", getPlaylists);

// mutations
router.post("/", isNostrAuthorized, createPlaylist);

// Export router
export default router;

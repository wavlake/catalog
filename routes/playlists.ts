import express from "express";
import { getPlaylist, createPlaylist } from "../controllers/playlists";
import { isNostrAuthorized } from "../middlewares/nostrAuth";

// Create router
const router = express.Router();

//////// ROUTES ////////

// queries
router.get("/:id", getPlaylist);

// mutations
router.post("/", isNostrAuthorized, createPlaylist);

// Export router
export default router;

import express from "express";
import { getPlaylists, createPlaylist } from "../controllers/playlists";
import { isAuthorized } from "../middlewares/auth";

// Create router
const router = express.Router();

//////// ROUTES ////////

// queries
router.get("/:id", getPlaylists);

// mutations
router.post("/", isAuthorized, createPlaylist);

// Export router
export default router;

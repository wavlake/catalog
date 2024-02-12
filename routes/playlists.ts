import express from "express";
import { get_playlists, createPlaylist } from "../controllers/playlists";
import { isAuthorized } from "../middlewares/auth";

// Create router
const router = express.Router();

//////// ROUTES ////////

// queries
router.get("/:id", get_playlists);

// mutations
router.post("/", isAuthorized, createPlaylist);

// Export router
export default router;

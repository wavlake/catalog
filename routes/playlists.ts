import express from "express";
import { isAuthorized } from "../middlewares/auth";

// Import controllers
import { createPlaylist } from "../controllers/playlists";

// Create router
const router = express.Router();

//////// ROUTES ////////

// queries

// mutations
router.post("/", isAuthorized, createPlaylist);

// Export router
export default router;

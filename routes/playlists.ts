import express from "express";
import playlistsController from "../controllers/playlists";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get("/:id", playlistsController.get_playlists);

// Export router
export default router;

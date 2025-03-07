const express = require("express");
const { isAuthorized } = require("../middlewares/auth");
const { isNostrAuthorizedOptional } = require("../middlewares/nostrAuth");

// Import controllers
import tracksController from "../controllers/tracks";

// Create router
const router = express.Router();

//////// ROUTES ////////

// queries
router.get("/account", isAuthorized, tracksController.get_tracks_by_account);
router.get("/new", tracksController.get_tracks_by_new);
router.get("/random", tracksController.get_tracks_by_random);
router.get("/featured/:pubkey?", tracksController.get_featured_tracks);
router.get(
  "/random/:genreId/genre",
  tracksController.get_random_tracks_by_genre_id
);
router.get("/", tracksController.search_tracks);
router.get("/:albumId/album", tracksController.get_tracks_by_album_id);
router.get("/:artistId/artist", tracksController.get_tracks_by_artist_id);
router.get("/:trackId", tracksController.get_track);
router.get("/ranking/:trackId", tracksController.get_track_ranking_count);

// mutations
router.post("/", isAuthorized, tracksController.create_track);
router.put("/update", isAuthorized, tracksController.update_track);
router.delete("/:trackId", isAuthorized, tracksController.delete_track);

// Export router
export default router;

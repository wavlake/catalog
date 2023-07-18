const express = require("express");
const { isAuthorized } = require("../middlewares/auth.js");
const multer = require("multer");

var storage = multer.diskStorage({
  destination: function (req, file, callback) {
    callback(null, `${process.env.LOCAL_UPLOAD_PATH}`);
  },
  filename: function (req, file, callback) {
    callback(null, file.originalname);
  },
});

const upload = multer({ storage: storage });

// Import controllers
import tracksController from "../controllers/tracks.js";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get("/account", isAuthorized, tracksController.get_tracks_by_account);
router.get("/new", tracksController.get_tracks_by_new);
router.get("/random", tracksController.get_tracks_by_random);
router.get("/:albumId/album", tracksController.get_tracks_by_album_id);
router.get("/:artistId/artist", tracksController.get_tracks_by_artist_id);
router.get("/:trackId", tracksController.get_track);
router.post(
  "/",
  isAuthorized,
  upload.single("audio"),
  tracksController.create_track
);
router.put("/update", isAuthorized, tracksController.update_track);
router.delete("/:trackId", isAuthorized, tracksController.delete_track);

// Export router
module.exports = router;

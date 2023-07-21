const express = require("express");
const multer = require("multer");
const { isAuthorized } = require("../middlewares/auth.js");

var storage = multer.diskStorage({
  destination: function (req, file, callback) {
    callback(null, `${process.env.LOCAL_UPLOAD_PATH}`);
  },
  filename: function (req, file, callback) {
    callback(null, file.originalname);
  },
});

const upload = multer({ storage: storage });

import artistsController from "../controllers/artists.js";

// Create router
const router = express.Router();

// router.get("/", artistsController.get_all_artists);
router.get("/account", isAuthorized, artistsController.get_artists_by_account);
router.get("/:artistUrl/url", artistsController.get_artist_by_url);
router.get("/:artistId", artistsController.get_artist_by_id);

router.post(
  "/create",
  upload.single("artwork"),
  isAuthorized,
  artistsController.create_artist
);
router.put("/update", isAuthorized, artistsController.update_artist);
// TODO: Update art should probably be part of update
router.put(
  "/update-art",
  upload.single("artwork"),
  isAuthorized,
  artistsController.update_artist_art
);
router.delete("/:artistId", isAuthorized, artistsController.delete_artist);

// Export router
module.exports = router;

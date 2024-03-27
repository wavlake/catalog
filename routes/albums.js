const express = require("express");
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
import albumsController from "../controllers/albums";
const { isAuthorized } = require("../middlewares/auth");

// Create router
const router = express.Router();

//////// ROUTES ////////

// queries
router.get("/account", isAuthorized, albumsController.get_albums_by_account);
router.get("/:albumId", albumsController.get_album_by_id);
router.get("/:artistId/artist", albumsController.get_albums_by_artist_id);
router.get("/:genreId/genre", albumsController.get_albums_by_genre_id);

// mutations
router.post(
  "/",
  isAuthorized,
  upload.single("artwork"),
  albumsController.create_album
);
router.post(
  "/update",
  isAuthorized,
  upload.single("artwork"),
  albumsController.update_album
);
router.delete("/:albumId", isAuthorized, albumsController.delete_album);

// Export router
export default router;

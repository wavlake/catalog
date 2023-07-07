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
import albumsController from "../controllers/albums.js";
const { isAuthorized } = require("../middlewares/auth");

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get("/account", isAuthorized, albumsController.get_albums_by_account);
router.get("/:albumId", albumsController.get_album_by_id);
router.get("/:artistId/artist", albumsController.get_albums_by_artist_id);
router.post("/", upload.single("artwork"), albumsController.create_album);
router.put("/", isAuthorized, albumsController.update_album);
router.put(
  "/album-art",
  upload.single("artwork"),
  isAuthorized,
  albumsController.update_album_art
);
router.delete("/:albumId", isAuthorized, albumsController.delete_album);

// Export router
module.exports = router;

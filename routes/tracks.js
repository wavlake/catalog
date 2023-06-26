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

router.get("/top", tracksController.get_index_top); // TOP 40
router.get("/:trackId", tracksController.get_track);
router.post(
  "/",
  isAuthorized,
  upload.single("audio"),
  tracksController.create_track
);
router.put("/", isAuthorized, tracksController.update_track);
router.delete("/:trackId", isAuthorized, tracksController.delete_track);

// Export router
module.exports = router;

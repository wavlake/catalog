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

import artistsController from "../controllers/artists.js";

// Create router
const router = express.Router();

router.get("/:artistUrl/url", artistsController.get_artist_by_url);

// Export router
module.exports = router;

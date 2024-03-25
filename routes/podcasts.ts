import express from "express";
import multer from "multer";
const { isAuthorized } = require("../middlewares/auth");

var storage = multer.diskStorage({
  destination: function (req, file, callback) {
    callback(null, `${process.env.LOCAL_UPLOAD_PATH}`);
  },
  filename: function (req, file, callback) {
    callback(null, file.originalname);
  },
});

const upload = multer({ storage: storage });

import {
  get_podcasts_by_account,
  create_podcast,
  get_podcast_by_id,
  get_podcast_by_url,
  update_podcast,
  delete_podcast,
} from "../controllers/podcasts";

// Create router
const router = express.Router();

// queries
router.get("/account", isAuthorized, get_podcasts_by_account);
router.get("/:podcastUrl/url", get_podcast_by_url);
router.get("/:podcastId", get_podcast_by_id);

// mutations
router.post("/create", upload.single("artwork"), isAuthorized, create_podcast);
router.post("/update", upload.single("artwork"), isAuthorized, update_podcast);

router.delete("/:podcastId", isAuthorized, delete_podcast);

export default router;

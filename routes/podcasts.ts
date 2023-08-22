import express from "express";
import multer from "multer";
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

import {
  get_podcasts_by_account,
  create_podcast,
  get_podcast_by_id,
  get_podcast_by_url,
  update_podcast,
  update_podcast_art,
  delete_podcast,
} from "../controllers/podcasts.js";

// Create router
const router = express.Router();

router.get("/account", isAuthorized, get_podcasts_by_account);
router.get("/:podcastUrl/url", get_podcast_by_url);
router.get("/:podcastId", get_podcast_by_id);

router.post("/create", upload.single("artwork"), isAuthorized, create_podcast);
router.put("/update", isAuthorized, update_podcast);
router.put(
  "/update-art",
  upload.single("artwork"),
  isAuthorized,
  update_podcast_art
);
router.delete("/:podcastId", isAuthorized, delete_podcast);

export default router;

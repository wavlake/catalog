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
} from "../controllers/podcasts.js";

// Create router
const router = express.Router();

router.get("/account", isAuthorized, get_podcasts_by_account);

router.post("/create", upload.single("artwork"), isAuthorized, create_podcast);

export default router;

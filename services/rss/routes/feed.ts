const express = require("express");
const { getMusicFeed, getPodcastFeed } = require("../controllers/feed");

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get("/music/:feedId", getMusicFeed);
router.get("/podcast/:feedId", getPodcastFeed);

// Export router
export default router;

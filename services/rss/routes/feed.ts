const express = require("express");
const {
  getArtistFeed,
  getMusicFeed,
  getPodcastFeed,
} = require("../controllers/feed");

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get("/music/:feedId", getMusicFeed);
router.get("/podcast/:feedId", getPodcastFeed);
router.get("/artist/:feedId", getArtistFeed);

// Export router
export default router;

const express = require("express");
const { isAuthorized } = require("../middlewares/auth.js");

// Import controllers
import statsController from "../controllers/stats.js";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get(
  "/account/earnings",
  isAuthorized,
  statsController.get_earnings_by_account
);
router.get(
  "/account/plays",
  isAuthorized,
  statsController.get_plays_by_account
);
// router.get("/music/subgenres/:genreId", statsController.get_music_subgenre_list);

// Export router
module.exports = router;

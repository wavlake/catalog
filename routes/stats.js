const express = require("express");
const { isAuthorized } = require("../middlewares/auth.js");

// Import controllers
import statsController from "../controllers/stats.js";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get(
  "/music/earnings",
  isAuthorized,
  statsController.get_earnings_by_account // Last 30 days
);
router.get(
  "/music/earnings/all",
  isAuthorized,
  statsController.get_earnings_all_time_by_account
);
router.get(
  "/music/earnings/all/monthly",
  isAuthorized,
  statsController.get_earnings_all_time_by_account_monthly
);
router.get(
  "/music/earnings/daily",
  isAuthorized,
  statsController.get_earnings_by_account_daily
);
router.get(
  "/music/earnings/tracks",
  isAuthorized,
  statsController.get_earnings_by_tracks
);
router.get(
  "/music/earnings/tracks/daily",
  isAuthorized,
  statsController.get_earnings_by_tracks_daily
);
router.get("/music/plays", isAuthorized, statsController.get_plays_by_account); // Last 30 days
router.get(
  "/music/plays/all",
  isAuthorized,
  statsController.get_plays_all_time_by_account
);
router.get(
  "/music/plays/all/monthly",
  isAuthorized,
  statsController.get_plays_all_time_by_account_monthly
);
router.get(
  "/music/plays/agent", // Top Agent for last 30 days
  isAuthorized,
  statsController.get_plays_by_agent_by_account
);
router.get(
  "/music/plays/daily",
  isAuthorized,
  statsController.get_plays_by_account_daily
);
router.get(
  "/music/plays/tracks",
  isAuthorized,
  statsController.get_plays_by_tracks
);
router.get(
  "/music/plays/tracks/daily",
  isAuthorized,
  statsController.get_plays_by_tracks_daily
);
router.get(
  "/music/totals/tracks/all",
  isAuthorized,
  statsController.get_totals_all_time_by_tracks // Plays and Earnings All-Time
);
// router.get("/music/subgenres/:genreId", statsController.get_music_subgenre_list);

// Export router
export default router;

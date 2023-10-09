import express from "express";

import controller from "../controllers/rssFeeds";

// Create router
const router = express.Router();

router.get("/", controller.get_rss_feeds);

export default router;

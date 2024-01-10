import express from "express";

import controller from "../controllers/feeds";

// Create router
const router = express.Router();

router.get("/all", controller.get_external_rss_feeds);
router.get("/:guid", controller.get_external_rss_feed);

export default router;

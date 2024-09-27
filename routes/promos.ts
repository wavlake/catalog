import express from "express";
import { getActivePromos, getPromoByContent } from "../controllers/promos";
import { isAuthorized } from "../middlewares/auth";

// Create router
const router = express.Router();

//////// ROUTES ////////

// queries
router.get("/active", isAuthorized, getActivePromos);
router.get("/content/:contentId", isAuthorized, getPromoByContent);

// Export router
export default router;

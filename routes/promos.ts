import express from "express";
import { getActivePromos, getPromoByContent } from "../controllers/promos";

// Create router
const router = express.Router();

//////// ROUTES ////////

// queries
router.get("/active", getActivePromos);
router.get("/content/:contentId", getPromoByContent);

// Export router
export default router;

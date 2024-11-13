import express from "express";
import {
  getActivePromos,
  getPromoByContent,
  getPromo,
} from "../controllers/promos";
import { isAuthorized } from "../middlewares/auth";

// Create router
const router = express.Router();

//////// ROUTES ////////

// queries
router.get("/active", isAuthorized, getActivePromos);
router.get("/content/:contentId", isAuthorized, getPromoByContent);
router.get("/:id", isAuthorized, getPromo);

// Export router
export default router;

import express from "express";
import { getActivePromos } from "../controllers/promos";

// Create router
const router = express.Router();

//////// ROUTES ////////

// queries
router.get("/active", getActivePromos);

// Export router
export default router;

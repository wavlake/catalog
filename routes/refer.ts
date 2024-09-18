import express from "express";

// Import controllers
import referController from "../controllers/refer";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get("/:referrerId", referController.get_referrer_public);

// Export router
export default router;

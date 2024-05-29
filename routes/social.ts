import express from "express";

// Import controllers
import socialController from "../controllers/social";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get("/feed/:pubkey", socialController.get_activity_feed);
router.get("/feed/user/:pubkey", socialController.get_account_activity);

// Export router
export default router;

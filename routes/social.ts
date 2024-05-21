import express from "express";

// Import controllers
import socialController from "../controllers/social";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get("/feed/:id", socialController.get_activity_feed);
router.get("/feed/user/:id", socialController.get_account_activity);

// Export router
export default router;

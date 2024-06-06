import express from "express";

// Import controllers
import socialController from "../controllers/social";
import { validatePaginationAndId } from "../middlewares/validatePagination";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get(
  "/feed/user/:pubkey/:page?/:pageSize?",
  validatePaginationAndId(),
  socialController.get_account_activity
);
router.get(
  "/feed/:pubkey/:page?/:pageSize?",
  validatePaginationAndId(),
  socialController.get_activity_feed
);

// Export router
export default router;

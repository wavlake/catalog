const express = require("express");
const { isAuthorized } = require("../middlewares/auth");

// Import controllers
import searchController from "../controllers/search";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get("/", searchController.get_all_by_term);
// Export router
export default router;

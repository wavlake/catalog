const express = require("express");
const { isAuthorized } = require("../middlewares/auth.js");

// Import controllers
import splitsController from "../controllers/splits.js";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.post("/", isAuthorized, splitsController.create_split);
router.get(
  "/:contentId/:contentType",
  isAuthorized,
  splitsController.get_split
);
router.put("/update", isAuthorized, splitsController.update_split);
// Export router
export default router;
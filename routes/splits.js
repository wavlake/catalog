const express = require("express");
const { isAuthorized } = require("../middlewares/auth");

// Import controllers
import splitsController from "../controllers/splits";
import timeSplitsController from "../controllers/timeSplits";

// Create router
const router = express.Router();

//////// ROUTES ////////

//// SPLITS ////

router.post("/", isAuthorized, splitsController.create_split);
router.get(
  "/:contentId/:contentType",
  isAuthorized,
  splitsController.get_split
);
router.put("/update", isAuthorized, splitsController.update_split);

//// TIME SPLITS ////

router.get("/time", isAuthorized, timeSplitsController.get_time_splits);
router.post("/time", isAuthorized, timeSplitsController.create_time_splits);
router.put("/time", isAuthorized, timeSplitsController.update_time_splits);
// Export router
export default router;

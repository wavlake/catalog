const express = require("express");
const multer = require("multer");
const { isZbdRegion } = require("../middlewares/zbdChecks");

var storage = multer.diskStorage({
  destination: function (req, file, callback) {
    callback(null, `${process.env.LOCAL_UPLOAD_PATH}`);
  },
  filename: function (req, file, callback) {
    callback(null, file.originalname);
  },
});

const upload = multer({ storage: storage });

// Import controllers
import accountsController from "../controllers/accounts";
import connectionsController from "../controllers/connections";
const { isAuthorized } = require("../middlewares/auth");

// Create router
const router = express.Router();

//////// ROUTES ////////

// USER
// router.get("/:userProfileUrl", usersController.get_user_public);
// router.get("/:userId/faves", usersController.get_user_public_faves);
router.get("/", isAuthorized, accountsController.get_account);
router.get(
  "/announcements",
  isAuthorized,
  accountsController.get_announcements
);
router.get("/activity/:page", isAuthorized, accountsController.get_activity);
router.get("/notification", isAuthorized, accountsController.get_notification);
router.put("/notification", isAuthorized, accountsController.put_notification);
router.get("/features", isAuthorized, accountsController.get_features);
router.get("/connections", isAuthorized, connectionsController.get_connections);
router.get("/history", isAuthorized, accountsController.get_history);
router.delete(
  "/connections/:pubkey",
  isAuthorized,
  connectionsController.delete_connection
);
router.post(
  "/connections",
  isAuthorized,
  connectionsController.create_connection
);
router.get(
  "/check-region",
  isAuthorized,
  isZbdRegion,
  accountsController.get_check_region
);
router.post(
  "/log-identity",
  isAuthorized,
  isZbdRegion,
  accountsController.post_log_identity
);

// Export router
export default router;

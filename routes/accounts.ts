import express from "express";
import multer from "multer";
import { isZbdRegion } from "../middlewares/zbdChecks";

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
import { isAuthorized } from "../middlewares/auth";

// Create router
const router = express.Router();

//////// ROUTES ////////

// USER
// router.get("/:userProfileUrl", usersController.get_user_public);
// router.get("/:userId/faves", usersController.get_user_public_faves);
router.post("/", accountsController.create_account);
router.get("/", isAuthorized, accountsController.get_account);
router.put(
  "/",
  upload.single("artwork"),
  isAuthorized,
  accountsController.edit_account
);
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
router.get("/txs/:page", isAuthorized, accountsController.get_txs);
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
router.post(
  "/ln-address",
  isAuthorized,
  accountsController.create_update_lnaddress
);

router.get("/zbd-login-url", accountsController.get_zbd_url);
router.post("/zbd-user-info", accountsController.get_zbd_user);

// Export router
export default router;

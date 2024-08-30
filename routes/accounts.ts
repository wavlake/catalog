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
import { isNostrAuthorized } from "../middlewares/nostrAuth";
import { isAPITokenAuthorized } from "../middlewares/isAPITokenAuthorized";

// Create router
const router = express.Router();

//////// ROUTES ////////

// USER
router.post("/", accountsController.create_account);
router.get("/", isAuthorized, accountsController.get_account);
router.get(
  "/public/verified/:userProfileUrl",
  isAPITokenAuthorized,
  accountsController.check_user_verified
);
router.get("/public/:userProfileUrl", accountsController.get_user_public);
router.get("/pubkey/:pubkey", accountsController.get_pubkey_metadata);
router.put("/pubkey/:pubkey", accountsController.update_metadata);
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
router.get("/notification", isAuthorized, accountsController.get_notification);
router.put("/notification", isAuthorized, accountsController.put_notification);
router.get("/features", isAuthorized, accountsController.get_features);
router.get("/connections", isAuthorized, connectionsController.get_connections);
router.get("/tx/splits/:id", isAuthorized, accountsController.get_splits);
router.get("/tx/:type/:id", isAuthorized, accountsController.get_tx_id);
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
router.delete("/ln-address", isAuthorized, accountsController.delete_lnaddress);

router.post(
  "/pubkey",
  // this route checks has additional auth and checks the firebase token wihin the controller
  isNostrAuthorized,
  accountsController.add_pubkey_to_account
);

router.delete(
  "/pubkey/:pubkey",
  isAuthorized,
  accountsController.delete_pubkey_from_account
);
router.get("/zbd/redirect-info", accountsController.get_zbd_redirect_info);
router.post(
  "/zbd/login-token",
  accountsController.get_login_token_for_zbd_user
);

// Export router
export default router;

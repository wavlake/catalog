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
import rateLimit from "express-rate-limit";
import { isFirebaseOrNostrAuthorized } from "../middlewares/firebaseOrNostrAuth";

// Create router
const router = express.Router();

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: "Too many requests from this IP, please try again later",
  keyGenerator: (req) => {
    return req.ip; // Use the IP address as the key
  },
});

//////// ROUTES ////////

// USER
router.post("/user", isAuthorized, accountsController.create_user);
router.post(
  "/user/verified",
  isAuthorized,
  isZbdRegion,
  accountsController.create_user_verified
);
router.get(
  "/user/check-username/:username",
  accountsController.get_check_username
);
router.get("/user/random-username", accountsController.get_random_username);
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
router.get(
  "/inbox/lastread",
  isAuthorized,
  accountsController.get_inbox_lastread
);
router.put(
  "/inbox/lastread",
  isAuthorized,
  accountsController.put_inbox_lastread
);
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
router.get("/check-region", isZbdRegion, accountsController.get_check_region);
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

router.get("/promos", isAuthorized, accountsController.get_track_promos);
router.put("/disable", isAuthorized, accountsController.disable_user);

router.get(
  "/invite/:listname",
  isFirebaseOrNostrAuthorized,
  accountsController.get_invite_list_status
);
router.put(
  "/invite/:listname",
  isFirebaseOrNostrAuthorized,
  accountsController.add_to_invite_list
);

// Export router
export default router;

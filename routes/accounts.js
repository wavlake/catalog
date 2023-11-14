const express = require("express");
const multer = require("multer");

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
router.get("/features", isAuthorized, accountsController.get_features);
router.get("/connections", isAuthorized, connectionsController.get_connections);
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
// router.get(
//   "/:userId/activity/:page",
//   isAuthorized,
//   usersController.get_user_activity
// );
// router.get(
//   "/:userId/notification",
//   isAuthorized,
//   usersController.get_user_notification_status
// );
// router.get("/:userId/albums", usersController.get_user_albums);
// router.get("/:userId/artists", usersController.get_user_artists);

// router.get("/:userId/txs", isAuthorized, usersController.get_txs);

// router.post("/", usersController.post_create_user);
// router.post(
//   "/check-activity",
//   usersController.post_user_notification_status
// );

// router.put("/", isAuthorized, usersController.put_edit_user);
// router.put(
//   "/user-art",
//   upload.single("artwork"),
//   isAuthorized,
//   usersController.put_edit_user_art
// );

// Export router
export default router;

import express from "express";
import depositController from "../controllers/deposit";
const { isAuthorized } = require("@middlewares/auth");
const { isWalletVerified } = require("@middlewares/zbdChecks");

// Create router
const router = express.Router();

//////// ROUTES ////////

router.post(
  "/",
  isAuthorized,
  isWalletVerified,
  depositController.createDeposit
);
router.get("/:id", isAuthorized, depositController.getDeposit);

// Export router
export default router;

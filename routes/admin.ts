import express from "express";
import { isFirebaseAuthorized } from "../middlewares/auth";
import { isAdmin } from "../middlewares/isAdmin";
import adminController from "../controllers/admin";

const router = express.Router();

router.post(
  "/takedown",
  isFirebaseAuthorized,
  isAdmin,
  adminController.takedownContent
);

export default router;

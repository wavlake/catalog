import express from "express";
import { isAdmin } from "../middlewares/isAdmin";
import adminController from "../controllers/admin";
import { isFirebaseOrNostrAuthorized } from "../middlewares/firebaseOrNostrAuth";

const router = express.Router();

router.post("/takedown", adminController.takedownContent);

router.get("/user/artists/:userId", adminController.get_artists_by_user_id);

export default router;

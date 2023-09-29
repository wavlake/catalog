import express from "express";
import { isNostrAuthorized } from "../middlewares/nostrAuth";
import libraryController from "../controllers/library";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get("/", isNostrAuthorized, libraryController.get_user_library);
router.post("/", isNostrAuthorized, libraryController.add_to_library);
router.delete("/", isNostrAuthorized, libraryController.remove_from_library);

// Export router
export default router;

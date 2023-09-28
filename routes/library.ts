import express from "express";
import { isNostrAuthorized } from "../middlewares/nostrAuth";
import libraryController from "../controllers/library";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get("/:id", isNostrAuthorized, libraryController.get_user_library);
router.post("/:id", isNostrAuthorized, libraryController.add_to_library);
router.delete("/:id", isNostrAuthorized, libraryController.remove_from_library);

// Export router
export default router;

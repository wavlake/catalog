import express from "express";
import { isNostrAuthorized } from "../middlewares/nostrAuth";
import libraryController from "../controllers/library";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get(
  "/artists",
  isNostrAuthorized,
  libraryController.get_user_library({ artists: true })
);
router.get(
  "/albums",
  isNostrAuthorized,
  libraryController.get_user_library({ albums: true })
);
router.get(
  "/tracks",
  isNostrAuthorized,
  libraryController.get_user_library({ tracks: true })
);
router.get(
  "/playlists",
  isNostrAuthorized,
  libraryController.get_user_library({ playlists: true })
);
router.post("/", isNostrAuthorized, libraryController.add_to_library);
router.delete("/:id", isNostrAuthorized, libraryController.remove_from_library);

// Export router
export default router;

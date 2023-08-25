const express = require("express");

// Import controllers
import metaController from "../controllers/meta.js";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get("/music/genres", metaController.get_music_genre_list);
router.get("/music/subgenres/:genreId", metaController.get_music_subgenre_list);

// Export router
export default router;

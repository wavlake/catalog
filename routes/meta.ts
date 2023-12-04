const express = require("express");

// Import controllers
import metaController from "../controllers/meta";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get("/music/genres", metaController.get_music_genre_list);
router.get("/music/subgenres/:genreId", metaController.get_music_subgenre_list);
router.get("/podcast/categories", metaController.get_podcast_category_list);
router.get(
  "/podcast/subcategories",
  metaController.get_podcast_subcategory_list
);

// Export router
export default router;

import express from "express";

// Import controllers
import metaController from "../controllers/meta";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get("/music/genres", metaController.get_music_genre_list);
router.get("/music/subgenres/:genreId", metaController.get_music_subgenre_list);
router.get("/podcast/categories", metaController.get_podcast_category_list);
router.get(
  "/podcast/subcategories/:categoryId",
  metaController.get_podcast_subcategory_list
);
router.get("/content/:contentId", metaController.get_content_type);
router.get("/content", metaController.get_meta_content_by_guids);

// Export router
export default router;

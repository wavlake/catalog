import express from "express";
const { isAuthorized } = require("../middlewares/auth");

import { publish_content } from "../controllers/publish";
import { checkContentOwnership } from "../middlewares/checkContentOwnership";

// Create router
const router = express.Router();

// mutations
router.post(
  "/:contentId",
  isAuthorized,
  checkContentOwnership,
  publish_content
);

export default router;

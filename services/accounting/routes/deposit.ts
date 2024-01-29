import express from "express";
const { isAuthorized } = require("@middlewares/auth");
const { isZbdIp, isZbdRegion } = require("@middlewares/zbdChecks");
const { rateLimit } = require("express-rate-limit");

// Create router
const router = express.Router();

//////// ROUTES ////////

//TODO

// Export router
export default router;

import express from "express";
import ticketsController from "../controllers/tickets";
import { isAPITokenAuthorized } from "@middlewares/isAPITokenAuthorized";

// Create router
const router = express.Router();

//////// ROUTES ////////

router.get(
  "/invoice",
  isAPITokenAuthorized,
  ticketsController.getTicketInvoice
);

// Export router
export default router;

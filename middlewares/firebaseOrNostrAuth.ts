import log from "loglevel";
import { isFirebaseAuthorized } from "./auth";
import { validateNostrEvent } from "./nostrAuth";

// Composite middleware to allow either Firebase or Nostr authorization
export const isFirebaseOrNostrAuthorized = (req, res, next) => {
  // Check if the request is authorized by either Firebase or Nostr
  Promise.allSettled([isFirebaseAuthorized(req), validateNostrEvent(req, res)])
    .then((responses) => {
      // if neither Firebase nor Nostr authorized the request, then return 401
      if (
        responses[0].status === "rejected" &&
        responses[1].status === "rejected"
      ) {
        log.info("Unauthorized request");
        log.info("Firebase auth:", responses[0].reason);
        log.info("Nostr auth:", responses[1].reason);
        res.status(401).json({ error: "Unauthorized" });

        return;
      } else {
        // Proceed to the next middleware
        next();
      }
    })
    .catch((err) => {
      log.error("Error in authorization middleware:", err);
      res.status(500).json({ error: "Internal Server Error" });
    });
};

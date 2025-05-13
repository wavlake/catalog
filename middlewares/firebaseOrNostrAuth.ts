import log from "../library/winston";
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
        log.info(responses);
        res.status(401).json({ error: "Unauthorized" });

        return;
      } else {
        const isFirebaseAuthorized =
          responses[0].status === "fulfilled" && responses[0].value !== null;
        const isNostrAuthorized =
          responses[1].status === "fulfilled" && responses[1].value !== null;
        isFirebaseAuthorized && log.info("Request is Firebase authorized");
        isNostrAuthorized && log.info("Request is Nostr authorized");
        // Proceed to the next middleware
        next();
      }
    })
    .catch((err) => {
      log.error("Error in authorization middleware:", err);
      res.status(500).json({ error: "Internal Server Error" });
    });
};

import { slowDown } from "express-slow-down";

const limiter = slowDown({
  windowMs: 60 * 1000, // 1 minute
  delayAfter: 12, // Allow 12 requests per 1 minute
  delayMs: (hits) => hits * 500, // Add 1000 ms of delay to every request after the 12th one.
});

// mock an express context
function createMiddlewareWrapper(middleware) {
  return async (npub: string): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      const fakeReq = {
        // Populate with relevant data from the Nostr event
        npub: npub,
        // Add other properties that your middleware might expect
      };

      const fakeRes = {
        setHeader: () => {},
        status: (code) => ({ json: (data) => {} }),
        json: (data) => {},
        // Add other response methods as needed
      };

      const next = (err) => {
        if (err) reject(err);
        else resolve();
      };

      middleware(fakeReq, fakeRes, next);
    });
  };
}

export const rateLimitMiddleware = createMiddlewareWrapper(limiter);

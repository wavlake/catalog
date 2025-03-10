import log, { LogLevelDesc } from "loglevel";
log.setLevel(process.env.LOGLEVEL as LogLevelDesc);

// Configurable constants for rate limiting and backoff
const INITIAL_WINDOW_MS = 60 * 1000; // 60 seconds
const MAX_REQUESTS_PER_WINDOW = 12;
const BACKOFF_FACTOR = 2;
const MAX_BACKOFF_MS = 30 * 1000; // 30 seconds
const BASE_DELAY_MS = 1000; // 1 second base delay for rate-limited requests

// Store for tracking rate limit windows and backoff times
const rateLimitStore = new Map();

const calculateDelay = (npub) => {
  const now = Date.now();
  let store = rateLimitStore.get(npub);

  if (!store || now - store.windowStart > store.windowMs) {
    // Reset or initialize the store for this npub
    store = {
      windowStart: now,
      windowMs: INITIAL_WINDOW_MS,
      count: 0,
    };
  }

  store.count++;

  if (store.count > MAX_REQUESTS_PER_WINDOW) {
    // Calculate delay based on how much the limit is exceeded
    const excessFactor =
      (store.count - MAX_REQUESTS_PER_WINDOW) / MAX_REQUESTS_PER_WINDOW;
    const delay = Math.min(
      BASE_DELAY_MS * (1 << Math.min(excessFactor, 4)), // Using bit shift for powers of 2
      MAX_BACKOFF_MS
    );

    // Increase the window size for the next cycle
    store.windowMs = Math.min(store.windowMs * BACKOFF_FACTOR, MAX_BACKOFF_MS);

    rateLimitStore.set(npub, store);
    return delay;
  }

  rateLimitStore.set(npub, store);
  return 0; // No delay if within rate limit
};

// Soft rate limiter function
export const applySoftRateLimit = async (npub) => {
  const delay = calculateDelay(npub);
  if (delay > 0) {
    log.info(`Applying soft rate limit for ${npub}. Delaying by ${delay}ms`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return delay;
};

const CLEANUP_INTERVAL_MS = 3600000; // 1 hour
const MAX_STORE_SIZE = 10000;

// Cleanup function
const cleanupStore = () => {
  const now = Date.now();
  let entriesToDelete = [];

  rateLimitStore.forEach((value, key) => {
    if (now - value.windowStart > value.windowMs * 2) {
      entriesToDelete.push(key);
    }
  });

  entriesToDelete.forEach((key) => rateLimitStore.delete(key));

  // If still too large, remove oldest entries
  if (rateLimitStore.size > MAX_STORE_SIZE) {
    const sortedEntries = [...rateLimitStore.entries()].sort(
      (a, b) => a[1].windowStart - b[1].windowStart
    );
    const excessEntries = sortedEntries.slice(
      0,
      rateLimitStore.size - MAX_STORE_SIZE
    );
    excessEntries.forEach(([key]) => rateLimitStore.delete(key));
  }
};

setInterval(cleanupStore, CLEANUP_INTERVAL_MS);

process.env.PODCAST_INDEX_KEY = "test-PODCAST_INDEX_KEY";
process.env.PODCAST_INDEX_SECRET = "test-PODCAST_INDEX_SECRET";

// Skip database-dependent tests in CI environments without database access
if (process.env.CI === "true" && !process.env.DATABASE_URL) {
  process.env.SKIP_DATABASE_TESTS = "true";
}

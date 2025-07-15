/**
 * Setup file for withdrawal security tests
 * Handles database connection validation and CI environment detection
 */

import db from "../library/db";

// Test database connection before running tests
export async function validateDatabaseConnection(): Promise<boolean> {
  try {
    // Simple query to test database connectivity
    await db.knex.raw("SELECT 1");
    return true;
  } catch (error) {
    console.warn("Database connection failed:", error.message);
    return false;
  }
}

// Check if we should skip database tests
export function shouldSkipDatabaseTests(): boolean {
  const isCI = process.env.CI === "true";
  const hasDatabase = !!process.env.DATABASE_URL;
  const forceSkip = process.env.SKIP_DATABASE_TESTS === "true";

  return forceSkip || (isCI && !hasDatabase);
}

// Log test environment information
export function logTestEnvironment(): void {
  console.log("Test Environment Info:");
  console.log(`- CI: ${process.env.CI || "false"}`);
  console.log(`- Database URL set: ${!!process.env.DATABASE_URL}`);
  console.log(`- Skip database tests: ${shouldSkipDatabaseTests()}`);
}

export default {
  validateDatabaseConnection,
  shouldSkipDatabaseTests,
  logTestEnvironment,
};

/**
 * Comprehensive test suite for withdrawal security fixes
 * Tests race condition prevention, security limits, and database optimizations
 */

import { initiatePaymentAtomic, runPaymentChecks } from "../library/payments";
import db from "../library/db";

// Check if we're in a CI environment without database access
const isCI = process.env.CI === "true" && !process.env.DATABASE_URL;
const skipDatabaseTests = isCI || process.env.SKIP_DATABASE_TESTS === "true";

describe("Withdrawal Security Tests", () => {
  if (skipDatabaseTests) {
    test.skip("Skipping database tests in CI environment without database access", () => {});
    return;
  }
  const TEST_CONFIG = {
    TEST_USER_NEW: "test-user-new-account",
    TEST_USER_EXISTING: "test-user-existing-account",
    SMALL_AMOUNT: 1000000, // 1k sats
    MEDIUM_AMOUNT: 50000000, // 50k sats
    LARGE_AMOUNT: 150000000, // 150k sats (exceeds 100k limit)
    TEST_INVOICE: "lnbc1000000n1pjqxtest123fake456invoice789",
    TEST_INVOICE_2: "lnbc1000000n1pjqxtest123fake456invoice790",
  };

  beforeAll(async () => {
    // Setup test users
    await db
      .knex("user")
      .insert([
        {
          id: TEST_CONFIG.TEST_USER_NEW,
          name: "Test User New Account",
          msat_balance: 500000000, // 500k sats
          created_at: new Date(), // New account
          is_locked: false,
        },
        {
          id: TEST_CONFIG.TEST_USER_EXISTING,
          name: "Test User Existing Account",
          msat_balance: 500000000, // 500k sats
          created_at: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2 days old
          is_locked: false,
        },
      ])
      .onConflict("id")
      .merge(["name", "msat_balance", "is_locked", "updated_at"]);
  });

  afterAll(async () => {
    // Clean up test data
    await db
      .knex("transaction")
      .whereIn("user_id", [
        TEST_CONFIG.TEST_USER_NEW,
        TEST_CONFIG.TEST_USER_EXISTING,
      ])
      .del();
    await db
      .knex("external_payment")
      .whereIn("user_id", [
        TEST_CONFIG.TEST_USER_NEW,
        TEST_CONFIG.TEST_USER_EXISTING,
      ])
      .del();
    await db
      .knex("user")
      .whereIn("id", [
        TEST_CONFIG.TEST_USER_NEW,
        TEST_CONFIG.TEST_USER_EXISTING,
      ])
      .del();
  });

  beforeEach(async () => {
    // Reset user state before each test
    await db
      .knex("user")
      .whereIn("id", [
        TEST_CONFIG.TEST_USER_NEW,
        TEST_CONFIG.TEST_USER_EXISTING,
      ])
      .update({ is_locked: false, msat_balance: 500000000 });

    // Clean up any pending transactions
    await db
      .knex("transaction")
      .whereIn("user_id", [
        TEST_CONFIG.TEST_USER_NEW,
        TEST_CONFIG.TEST_USER_EXISTING,
      ])
      .del();
    await db
      .knex("external_payment")
      .whereIn("user_id", [
        TEST_CONFIG.TEST_USER_NEW,
        TEST_CONFIG.TEST_USER_EXISTING,
      ])
      .del();
  });

  describe("Basic Functionality", () => {
    test("should successfully initiate a basic withdrawal", async () => {
      const result = await initiatePaymentAtomic(
        TEST_CONFIG.TEST_USER_EXISTING,
        TEST_CONFIG.TEST_INVOICE,
        TEST_CONFIG.SMALL_AMOUNT,
        1000, // 1 sat fee
      );

      expect(result.success).toBe(true);
      expect(result.paymentRecordId).toBeDefined();

      // Verify payment record was created
      const paymentRecord = await db
        .knex("transaction")
        .where("id", result.paymentRecordId)
        .first();

      expect(paymentRecord).toBeDefined();
      expect(paymentRecord.is_pending).toBe(true);
      expect(paymentRecord.withdraw).toBe(true);

      // Verify user is locked
      const user = await db
        .knex("user")
        .where("id", TEST_CONFIG.TEST_USER_EXISTING)
        .first();

      expect(user.is_locked).toBe(true);
    });

    test("should handle database transaction rollback on error", async () => {
      // Test with insufficient funds
      const result = await initiatePaymentAtomic(
        TEST_CONFIG.TEST_USER_EXISTING,
        TEST_CONFIG.TEST_INVOICE,
        600000000, // 600k sats (more than 500k balance)
        1000,
      );

      expect(result.success).toBe(false);
      // Could be insufficient funds OR daily limit - both are valid security responses
      expect(result.error?.message).toMatch(
        /Insufficient funds|Daily withdrawal limit exceeded/,
      );

      // Verify no payment record was created
      const paymentRecord = await db
        .knex("transaction")
        .where("user_id", TEST_CONFIG.TEST_USER_EXISTING)
        .where("payment_request", TEST_CONFIG.TEST_INVOICE)
        .first();

      expect(paymentRecord).toBeUndefined();

      // Verify user is not locked
      const user = await db
        .knex("user")
        .where("id", TEST_CONFIG.TEST_USER_EXISTING)
        .first();

      expect(user.is_locked).toBe(false);
    });
  });

  describe("Security Limits", () => {
    test("should enforce rate limiting - minimum time between attempts", async () => {
      // First withdrawal
      const result1 = await initiatePaymentAtomic(
        TEST_CONFIG.TEST_USER_EXISTING,
        TEST_CONFIG.TEST_INVOICE,
        TEST_CONFIG.SMALL_AMOUNT,
        1000,
      );

      expect(result1.success).toBe(true);

      // Mark first withdrawal as completed and unlock user
      await db
        .knex("transaction")
        .where("id", result1.paymentRecordId)
        .update({ is_pending: false, success: true });

      await db
        .knex("user")
        .where("id", TEST_CONFIG.TEST_USER_EXISTING)
        .update({ is_locked: false });

      // Immediate second withdrawal should fail
      const result2 = await initiatePaymentAtomic(
        TEST_CONFIG.TEST_USER_EXISTING,
        TEST_CONFIG.TEST_INVOICE_2,
        TEST_CONFIG.SMALL_AMOUNT,
        1000,
      );

      expect(result2.success).toBe(false);
      expect(result2.error?.message).toContain("wait at least");
    });

    test("should enforce daily withdrawal limit", async () => {
      // Create a user with no recent transactions to avoid rate limiting
      const uniqueUserId = `test-user-daily-limit-${Date.now()}`;
      await db.knex("user").insert({
        id: uniqueUserId,
        name: `Test User Daily Limit ${Date.now()}`, // Make name unique
        msat_balance: 500000000,
        created_at: new Date(Date.now() - 48 * 60 * 60 * 1000),
        is_locked: false,
      });

      // Create a large successful withdrawal from today (but > 30 seconds ago to avoid rate limiting)
      await db.knex("transaction").insert({
        user_id: uniqueUserId,
        msat_amount: 350000000, // 350k sats
        withdraw: true,
        success: true,
        is_pending: false,
        created_at: new Date(Date.now() - 35 * 1000), // 35 seconds ago to avoid rate limiting
        pre_tx_balance: 500000000,
        payment_request: "previous-large-withdrawal",
      });

      // Try to withdraw another 150k sats (total would be 500k, exceeding 400k limit)
      const result = await initiatePaymentAtomic(
        uniqueUserId,
        TEST_CONFIG.TEST_INVOICE,
        150000000, // 150k sats
        1000,
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain(
        "Daily withdrawal limit exceeded",
      );

      // Clean up
      await db.knex("transaction").where("user_id", uniqueUserId).del();
      await db.knex("user").where("id", uniqueUserId).del();
    });

    test("should enforce per-transaction amount limit", async () => {
      const result = await initiatePaymentAtomic(
        TEST_CONFIG.TEST_USER_EXISTING,
        TEST_CONFIG.TEST_INVOICE,
        TEST_CONFIG.LARGE_AMOUNT, // 150k sats (exceeds 100k limit)
        1000,
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain(
        "exceeds maximum allowed per transaction",
      );
    });

    test("should enforce account age restriction for large withdrawals", async () => {
      const result = await initiatePaymentAtomic(
        TEST_CONFIG.TEST_USER_NEW, // New account
        TEST_CONFIG.TEST_INVOICE,
        15000000, // 15k sats (large withdrawal for new account)
        1000,
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("at least 24 hours old");
    });

    test("should detect and reject duplicate invoices", async () => {
      // First withdrawal
      const result1 = await initiatePaymentAtomic(
        TEST_CONFIG.TEST_USER_EXISTING,
        TEST_CONFIG.TEST_INVOICE,
        TEST_CONFIG.SMALL_AMOUNT,
        1000,
      );

      expect(result1.success).toBe(true);

      // Second withdrawal with same invoice should fail
      const result2 = await initiatePaymentAtomic(
        TEST_CONFIG.TEST_USER_EXISTING,
        TEST_CONFIG.TEST_INVOICE, // Same invoice
        TEST_CONFIG.SMALL_AMOUNT,
        1000,
      );

      expect(result2.success).toBe(false);
      expect(result2.error?.message).toContain("duplicate payment request");
    });

    test("should detect suspicious activity patterns", async () => {
      // Create a unique user for this test to avoid conflicts
      const suspiciousUserId = `test-user-suspicious-${Date.now()}`;
      await db.knex("user").insert({
        id: suspiciousUserId,
        name: `Test Suspicious User ${Date.now()}`, // Make name unique
        msat_balance: 500000000,
        created_at: new Date(Date.now() - 48 * 60 * 60 * 1000),
        is_locked: false,
      });

      // Create 6 failed withdrawal attempts in the past hour (exceeds threshold of 5)
      const failedAttempts = Array.from({ length: 6 }, (_, i) => ({
        user_id: suspiciousUserId,
        msat_amount: TEST_CONFIG.SMALL_AMOUNT,
        withdraw: true,
        success: false,
        is_pending: false,
        created_at: new Date(Date.now() - (60 - i * 5) * 60 * 1000), // Every 5 minutes over past hour
        pre_tx_balance: 500000000,
        payment_request: `failed-attempt-${suspiciousUserId}-${i}`,
        failure_reason: "Test failed attempt",
      }));

      await db.knex("transaction").insert(failedAttempts);

      // Next withdrawal attempt should be blocked due to suspicious activity
      const result = await initiatePaymentAtomic(
        suspiciousUserId,
        `test-invoice-suspicious-${Date.now()}`, // Unique invoice
        TEST_CONFIG.SMALL_AMOUNT,
        1000,
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("suspicious activity");

      // Clean up
      await db.knex("transaction").where("user_id", suspiciousUserId).del();
      await db.knex("user").where("id", suspiciousUserId).del();
    });
  });

  describe("Race Condition Prevention", () => {
    test("should prevent multiple pending withdrawals per user", async () => {
      // Create first pending withdrawal
      const result1 = await initiatePaymentAtomic(
        TEST_CONFIG.TEST_USER_EXISTING,
        TEST_CONFIG.TEST_INVOICE,
        TEST_CONFIG.SMALL_AMOUNT,
        1000,
      );

      expect(result1.success).toBe(true);

      // Second withdrawal should fail due to pending transaction
      const result2 = await initiatePaymentAtomic(
        TEST_CONFIG.TEST_USER_EXISTING,
        TEST_CONFIG.TEST_INVOICE_2,
        TEST_CONFIG.SMALL_AMOUNT,
        1000,
      );

      expect(result2.success).toBe(false);
      expect(result2.error?.message).toContain(
        "Another transaction is pending",
      );
    });

    test("should respect database unique constraint", async () => {
      // Create first pending withdrawal
      const result1 = await initiatePaymentAtomic(
        TEST_CONFIG.TEST_USER_EXISTING,
        TEST_CONFIG.TEST_INVOICE,
        TEST_CONFIG.SMALL_AMOUNT,
        1000,
      );

      expect(result1.success).toBe(true);

      // Try to manually insert another pending withdrawal (should fail)
      await expect(
        db.knex("transaction").insert({
          user_id: TEST_CONFIG.TEST_USER_EXISTING,
          msat_amount: TEST_CONFIG.SMALL_AMOUNT,
          withdraw: true,
          is_pending: true,
          payment_request: TEST_CONFIG.TEST_INVOICE_2,
          pre_tx_balance: 500000000,
        }),
      ).rejects.toThrow(); // Should violate unique constraint
    });
  });

  describe("Database Query Optimization", () => {
    test("should correctly calculate in-flight amounts with optimized query", async () => {
      // Create some in-flight transactions
      const externalPaymentId = await db
        .knex("external_payment")
        .insert({
          user_id: TEST_CONFIG.TEST_USER_EXISTING,
          msat_amount: 10000000, // 10k sats
          fee_msat: 1000,
          is_pending: true,
          is_settled: false, // Add required field
          pubkey: "test-pubkey-for-external-payment",
          external_id: "test-external-payment",
        })
        .returning("id")
        .then((rows) => rows[0].id);

      // Test that withdrawal correctly accounts for in-flight amounts
      const result = await initiatePaymentAtomic(
        TEST_CONFIG.TEST_USER_EXISTING,
        `test-invoice-inflight-${Date.now()}`, // Unique invoice
        TEST_CONFIG.MEDIUM_AMOUNT, // Should work despite in-flight amount
        1000,
      );

      expect(result.success).toBe(true);

      // Clean up
      await db.knex("external_payment").where("id", externalPaymentId).del();
    });

    test("should handle empty in-flight amounts correctly", async () => {
      // No in-flight transactions exist
      const result = await initiatePaymentAtomic(
        TEST_CONFIG.TEST_USER_EXISTING,
        TEST_CONFIG.TEST_INVOICE,
        TEST_CONFIG.MEDIUM_AMOUNT,
        1000,
      );

      expect(result.success).toBe(true);
    });
  });

  describe("Monitoring Views", () => {
    test("should have accessible monitoring views", async () => {
      const views = [
        "transaction_race_condition_monitor",
        "withdrawal_security_monitor",
        "daily_withdrawal_tracking",
      ];

      for (const viewName of views) {
        // Test that view exists and is queryable
        const result = await db.knex.raw(`SELECT * FROM ${viewName} LIMIT 1`);
        expect(result.rows).toBeDefined();
      }
    });

    test("should detect race conditions in monitoring view", async () => {
      // This view should normally return 0 rows (no race conditions)
      const result = await db.knex.raw(
        "SELECT * FROM transaction_race_condition_monitor",
      );
      expect(result.rows.length).toBe(0);
    });
  });

  describe("Legacy Function Compatibility", () => {
    test("runPaymentChecks should still work for backward compatibility", async () => {
      const result = await runPaymentChecks(
        TEST_CONFIG.TEST_USER_EXISTING,
        TEST_CONFIG.TEST_INVOICE,
        TEST_CONFIG.SMALL_AMOUNT,
        1000,
      );

      expect(result.success).toBe(true);
    });

    test("runPaymentChecks should detect insufficient funds", async () => {
      const result = await runPaymentChecks(
        TEST_CONFIG.TEST_USER_EXISTING,
        TEST_CONFIG.TEST_INVOICE,
        600000000, // More than balance
        1000,
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("Insufficient funds");
    });
  });
});

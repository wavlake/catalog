#!/usr/bin/env node
/**
 * Comprehensive test suite for withdrawal security fixes
 * Tests race condition prevention, security limits, and database optimizations
 */

const {
  initiatePaymentAtomic,
  runPaymentChecks,
} = require("./dist/library/payments");
const db = require("./dist/library/db").default;

// Test configuration
const TEST_CONFIG = {
  // Test user IDs (will be created if they don't exist)
  TEST_USER_NEW: "test-user-new-account",
  TEST_USER_EXISTING: "test-user-existing-account",

  // Test amounts (in millisatoshis)
  SMALL_AMOUNT: 1000000, // 1k sats
  MEDIUM_AMOUNT: 50000000, // 50k sats
  LARGE_AMOUNT: 150000000, // 150k sats (exceeds 100k limit)
  DAILY_LIMIT_AMOUNT: 450000000, // 450k sats (exceeds 400k daily limit)

  // Test invoice (dummy)
  TEST_INVOICE: "lnbc1000000n1pjqxtest123fake456invoice789",
  TEST_INVOICE_2: "lnbc1000000n1pjqxtest123fake456invoice790",
};

class WithdrawalSecurityTester {
  constructor() {
    this.testResults = [];
    this.cleanup = [];
  }

  log(message, type = "INFO") {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${type}: ${message}`);
  }

  async runTest(testName, testFunction) {
    this.log(`Running test: ${testName}`, "TEST");
    try {
      const startTime = Date.now();
      await testFunction();
      const duration = Date.now() - startTime;
      this.testResults.push({ name: testName, status: "PASS", duration });
      this.log(`✅ PASSED: ${testName} (${duration}ms)`, "PASS");
    } catch (error) {
      this.testResults.push({
        name: testName,
        status: "FAIL",
        error: error.message,
      });
      this.log(`❌ FAILED: ${testName} - ${error.message}`, "FAIL");
      throw error;
    }
  }

  async setupTestData() {
    this.log("Setting up test data...", "SETUP");

    // Create test users with different account ages
    await db
      .knex("user")
      .insert([
        {
          id: TEST_CONFIG.TEST_USER_NEW,
          msat_balance: 500000000, // 500k sats
          created_at: new Date(), // New account
          is_locked: false,
        },
        {
          id: TEST_CONFIG.TEST_USER_EXISTING,
          msat_balance: 500000000, // 500k sats
          created_at: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2 days old
          is_locked: false,
        },
      ])
      .onConflict("id")
      .merge(["msat_balance", "is_locked", "updated_at"]);

    this.cleanup.push(() =>
      db
        .knex("user")
        .whereIn("id", [
          TEST_CONFIG.TEST_USER_NEW,
          TEST_CONFIG.TEST_USER_EXISTING,
        ])
        .del(),
    );

    this.log("Test data setup complete", "SETUP");
  }

  async cleanupTestData() {
    this.log("Cleaning up test data...", "CLEANUP");

    // Clean up in reverse order
    for (const cleanupFn of this.cleanup.reverse()) {
      try {
        await cleanupFn();
      } catch (error) {
        this.log(`Cleanup error: ${error.message}`, "WARN");
      }
    }

    this.log("Cleanup complete", "CLEANUP");
  }

  // Test 1: Basic functionality validation
  async testBasicWithdrawal() {
    const result = await initiatePaymentAtomic(
      TEST_CONFIG.TEST_USER_EXISTING,
      TEST_CONFIG.TEST_INVOICE,
      TEST_CONFIG.SMALL_AMOUNT,
      1000, // 1 sat fee
    );

    if (!result.success) {
      throw new Error(`Basic withdrawal failed: ${result.error?.message}`);
    }

    if (!result.paymentRecordId) {
      throw new Error("Payment record ID not returned");
    }

    // Verify payment record was created
    const paymentRecord = await db
      .knex("transaction")
      .where("id", result.paymentRecordId)
      .first();

    if (!paymentRecord) {
      throw new Error("Payment record not found in database");
    }

    if (!paymentRecord.is_pending) {
      throw new Error("Payment record should be pending");
    }

    // Verify user is locked
    const user = await db
      .knex("user")
      .where("id", TEST_CONFIG.TEST_USER_EXISTING)
      .first();

    if (!user.is_locked) {
      throw new Error("User should be locked after withdrawal initiation");
    }

    // Clean up the test transaction
    this.cleanup.push(() =>
      db.knex("transaction").where("id", result.paymentRecordId).del(),
    );
    this.cleanup.push(() =>
      db
        .knex("user")
        .where("id", TEST_CONFIG.TEST_USER_EXISTING)
        .update({ is_locked: false }),
    );
  }

  // Test 2: Rate limiting - minimum time between attempts
  async testRateLimitingMinTime() {
    // First withdrawal
    const result1 = await initiatePaymentAtomic(
      TEST_CONFIG.TEST_USER_EXISTING,
      TEST_CONFIG.TEST_INVOICE,
      TEST_CONFIG.SMALL_AMOUNT,
      1000,
    );

    if (!result1.success) {
      throw new Error(`First withdrawal failed: ${result1.error?.message}`);
    }

    // Mark first withdrawal as completed immediately
    await db
      .knex("transaction")
      .where("id", result1.paymentRecordId)
      .update({ is_pending: false, success: true });

    // Unlock user
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

    if (result2.success) {
      throw new Error(
        "Second immediate withdrawal should have been blocked by rate limiting",
      );
    }

    if (!result2.error?.message.includes("wait at least")) {
      throw new Error(
        `Expected rate limiting error, got: ${result2.error?.message}`,
      );
    }

    this.cleanup.push(() =>
      db.knex("transaction").where("id", result1.paymentRecordId).del(),
    );
  }

  // Test 3: Daily withdrawal limit
  async testDailyWithdrawalLimit() {
    // Create a large successful withdrawal from today
    const largeWithdrawalId = await db
      .knex("transaction")
      .insert({
        user_id: TEST_CONFIG.TEST_USER_EXISTING,
        msat_amount: 350000000, // 350k sats
        withdraw: true,
        success: true,
        is_pending: false,
        created_at: new Date(),
        pre_tx_balance: 500000000,
      })
      .returning("id")
      .then((rows) => rows[0].id);

    this.cleanup.push(() =>
      db.knex("transaction").where("id", largeWithdrawalId).del(),
    );

    // Try to withdraw another 150k sats (total would be 500k, exceeding 400k limit)
    const result = await initiatePaymentAtomic(
      TEST_CONFIG.TEST_USER_EXISTING,
      TEST_CONFIG.TEST_INVOICE,
      150000000, // 150k sats
      1000,
    );

    if (result.success) {
      throw new Error("Withdrawal should have been blocked by daily limit");
    }

    if (!result.error?.message.includes("Daily withdrawal limit exceeded")) {
      throw new Error(
        `Expected daily limit error, got: ${result.error?.message}`,
      );
    }
  }

  // Test 4: Per-transaction amount limit
  async testPerTransactionLimit() {
    const result = await initiatePaymentAtomic(
      TEST_CONFIG.TEST_USER_EXISTING,
      TEST_CONFIG.TEST_INVOICE,
      TEST_CONFIG.LARGE_AMOUNT, // 150k sats (exceeds 100k limit)
      1000,
    );

    if (result.success) {
      throw new Error(
        "Large withdrawal should have been blocked by per-transaction limit",
      );
    }

    if (
      !result.error?.message.includes("exceeds maximum allowed per transaction")
    ) {
      throw new Error(
        `Expected per-transaction limit error, got: ${result.error?.message}`,
      );
    }
  }

  // Test 5: Account age restriction for large withdrawals
  async testAccountAgeRestriction() {
    const result = await initiatePaymentAtomic(
      TEST_CONFIG.TEST_USER_NEW, // New account
      TEST_CONFIG.TEST_INVOICE,
      15000000, // 15k sats (large withdrawal for new account)
      1000,
    );

    if (result.success) {
      throw new Error(
        "Large withdrawal from new account should have been blocked",
      );
    }

    if (!result.error?.message.includes("at least 24 hours old")) {
      throw new Error(
        `Expected account age error, got: ${result.error?.message}`,
      );
    }
  }

  // Test 6: Duplicate invoice detection
  async testDuplicateInvoiceDetection() {
    // First withdrawal
    const result1 = await initiatePaymentAtomic(
      TEST_CONFIG.TEST_USER_EXISTING,
      TEST_CONFIG.TEST_INVOICE,
      TEST_CONFIG.SMALL_AMOUNT,
      1000,
    );

    if (!result1.success) {
      throw new Error(`First withdrawal failed: ${result1.error?.message}`);
    }

    this.cleanup.push(() =>
      db.knex("transaction").where("id", result1.paymentRecordId).del(),
    );
    this.cleanup.push(() =>
      db
        .knex("user")
        .where("id", TEST_CONFIG.TEST_USER_EXISTING)
        .update({ is_locked: false }),
    );

    // Second withdrawal with same invoice should fail
    const result2 = await initiatePaymentAtomic(
      TEST_CONFIG.TEST_USER_EXISTING,
      TEST_CONFIG.TEST_INVOICE, // Same invoice
      TEST_CONFIG.SMALL_AMOUNT,
      1000,
    );

    if (result2.success) {
      throw new Error("Duplicate invoice should have been rejected");
    }

    if (!result2.error?.message.includes("duplicate payment request")) {
      throw new Error(
        `Expected duplicate invoice error, got: ${result2.error?.message}`,
      );
    }
  }

  // Test 7: Insufficient funds detection
  async testInsufficientFunds() {
    // Try to withdraw more than available balance
    const result = await initiatePaymentAtomic(
      TEST_CONFIG.TEST_USER_EXISTING,
      TEST_CONFIG.TEST_INVOICE,
      600000000, // 600k sats (more than 500k balance)
      1000,
    );

    if (result.success) {
      throw new Error("Withdrawal exceeding balance should have been blocked");
    }

    if (!result.error?.message.includes("Insufficient funds")) {
      throw new Error(
        `Expected insufficient funds error, got: ${result.error?.message}`,
      );
    }
  }

  // Test 8: Database constraint validation
  async testDatabaseConstraints() {
    // Verify unique index exists and works
    const result1 = await initiatePaymentAtomic(
      TEST_CONFIG.TEST_USER_EXISTING,
      TEST_CONFIG.TEST_INVOICE,
      TEST_CONFIG.SMALL_AMOUNT,
      1000,
    );

    if (!result1.success) {
      throw new Error(`First withdrawal failed: ${result1.error?.message}`);
    }

    this.cleanup.push(() =>
      db.knex("transaction").where("id", result1.paymentRecordId).del(),
    );
    this.cleanup.push(() =>
      db
        .knex("user")
        .where("id", TEST_CONFIG.TEST_USER_EXISTING)
        .update({ is_locked: false }),
    );

    // Try to manually insert another pending withdrawal (should fail due to unique constraint)
    try {
      await db.knex("transaction").insert({
        user_id: TEST_CONFIG.TEST_USER_EXISTING,
        msat_amount: TEST_CONFIG.SMALL_AMOUNT,
        withdraw: true,
        is_pending: true,
        payment_request: TEST_CONFIG.TEST_INVOICE_2,
        pre_tx_balance: 500000000,
      });
      throw new Error(
        "Database should have prevented duplicate pending withdrawal",
      );
    } catch (error) {
      if (
        !error.message.includes("unique_pending_withdrawal_per_user") &&
        !error.message.includes("duplicate key")
      ) {
        throw new Error(
          `Expected unique constraint error, got: ${error.message}`,
        );
      }
    }
  }

  // Test 9: Database query optimization validation
  async testDatabaseQueryOptimization() {
    // Create some in-flight transactions to test the optimized query
    const externalPaymentId = await db
      .knex("external_payment")
      .insert({
        user_id: TEST_CONFIG.TEST_USER_EXISTING,
        msat_amount: 10000000, // 10k sats
        fee_msat: 1000,
        is_pending: true,
        external_id: "test-external-payment",
        preimage: "test-preimage",
      })
      .returning("id")
      .then((rows) => rows[0].id);

    this.cleanup.push(() =>
      db.knex("external_payment").where("id", externalPaymentId).del(),
    );

    // Test that the optimized query correctly calculates in-flight amounts
    const result = await initiatePaymentAtomic(
      TEST_CONFIG.TEST_USER_EXISTING,
      TEST_CONFIG.TEST_INVOICE,
      TEST_CONFIG.MEDIUM_AMOUNT, // Should account for in-flight amount
      1000,
    );

    if (!result.success) {
      throw new Error(
        `Withdrawal with in-flight amounts failed: ${result.error?.message}`,
      );
    }

    this.cleanup.push(() =>
      db.knex("transaction").where("id", result.paymentRecordId).del(),
    );
    this.cleanup.push(() =>
      db
        .knex("user")
        .where("id", TEST_CONFIG.TEST_USER_EXISTING)
        .update({ is_locked: false }),
    );
  }

  // Test 10: Monitoring views functionality
  async testMonitoringViews() {
    // Check that monitoring views exist and work
    const views = [
      "transaction_race_condition_monitor",
      "withdrawal_security_monitor",
      "daily_withdrawal_tracking",
    ];

    for (const viewName of views) {
      const result = await db.knex.raw(`SELECT * FROM ${viewName} LIMIT 1`);
      if (!result.rows !== undefined) {
        throw new Error(`Monitoring view ${viewName} is not accessible`);
      }
    }
  }

  async generateReport() {
    this.log("\n=== TEST RESULTS SUMMARY ===", "REPORT");

    const passed = this.testResults.filter((r) => r.status === "PASS").length;
    const failed = this.testResults.filter((r) => r.status === "FAIL").length;
    const total = this.testResults.length;

    this.log(`Total tests: ${total}`, "REPORT");
    this.log(`Passed: ${passed}`, "REPORT");
    this.log(`Failed: ${failed}`, "REPORT");

    if (failed > 0) {
      this.log("\n=== FAILED TESTS ===", "REPORT");
      this.testResults
        .filter((r) => r.status === "FAIL")
        .forEach((test) => {
          this.log(`❌ ${test.name}: ${test.error}`, "REPORT");
        });
    }

    this.log("\n=== DETAILED RESULTS ===", "REPORT");
    this.testResults.forEach((test) => {
      const status = test.status === "PASS" ? "✅" : "❌";
      const duration = test.duration ? ` (${test.duration}ms)` : "";
      this.log(`${status} ${test.name}${duration}`, "REPORT");
    });

    return { passed, failed, total, success: failed === 0 };
  }

  async runAllTests() {
    try {
      await this.setupTestData();

      // Run all tests
      await this.runTest("Basic Withdrawal Functionality", () =>
        this.testBasicWithdrawal(),
      );
      await this.runTest("Rate Limiting - Minimum Time", () =>
        this.testRateLimitingMinTime(),
      );
      await this.runTest("Daily Withdrawal Limit", () =>
        this.testDailyWithdrawalLimit(),
      );
      await this.runTest("Per-Transaction Amount Limit", () =>
        this.testPerTransactionLimit(),
      );
      await this.runTest("Account Age Restriction", () =>
        this.testAccountAgeRestriction(),
      );
      await this.runTest("Duplicate Invoice Detection", () =>
        this.testDuplicateInvoiceDetection(),
      );
      await this.runTest("Insufficient Funds Detection", () =>
        this.testInsufficientFunds(),
      );
      await this.runTest("Database Constraints", () =>
        this.testDatabaseConstraints(),
      );
      await this.runTest("Database Query Optimization", () =>
        this.testDatabaseQueryOptimization(),
      );
      await this.runTest("Monitoring Views", () => this.testMonitoringViews());
    } finally {
      await this.cleanupTestData();
    }

    return await this.generateReport();
  }
}

// Main execution
async function main() {
  const tester = new WithdrawalSecurityTester();

  try {
    console.log("🚀 Starting Withdrawal Security Test Suite");
    console.log("Branch: fix-race-conditions");
    console.log("Testing against local database\n");

    const results = await tester.runAllTests();

    if (results.success) {
      console.log(
        "\n🎉 ALL TESTS PASSED! The withdrawal security fixes are working correctly.",
      );
      process.exit(0);
    } else {
      console.log("\n💥 SOME TESTS FAILED! Please review the failures above.");
      process.exit(1);
    }
  } catch (error) {
    console.error("\n💥 TEST SUITE FAILED:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Export for potential use in other test files
module.exports = { WithdrawalSecurityTester, TEST_CONFIG };

// Run if called directly
if (require.main === module) {
  main();
}

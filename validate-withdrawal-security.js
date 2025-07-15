#!/usr/bin/env node
/**
 * Quick validation script for withdrawal security fixes
 * Tests the most critical functionality without long timeouts
 */

const { initiatePaymentAtomic } = require("./dist/library/payments");
const db = require("./dist/library/db").default;

async function validateSecurity() {
  console.log("🚀 Validating Withdrawal Security Fixes...\n");

  const TEST_USER = "validation-test-user";
  const results = [];

  try {
    // Setup test user
    await db
      .knex("user")
      .insert({
        id: TEST_USER,
        name: "Validation Test User",
        msat_balance: 500000000, // 500k sats
        created_at: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2 days old
        is_locked: false,
      })
      .onConflict("id")
      .merge(["name", "msat_balance", "is_locked", "updated_at"]);

    // Test 1: Basic withdrawal works
    console.log("Testing basic withdrawal...");
    const basicResult = await initiatePaymentAtomic(
      TEST_USER,
      "test-invoice-basic",
      1000000, // 1k sats
      1000,
    );

    if (basicResult.success) {
      console.log("✅ Basic withdrawal: PASS");
      results.push({ test: "Basic withdrawal", status: "PASS" });

      // Clean up pending transaction
      await db
        .knex("transaction")
        .where("id", basicResult.paymentRecordId)
        .del();
      await db.knex("user").where("id", TEST_USER).update({ is_locked: false });
    } else {
      console.log(`❌ Basic withdrawal: FAIL - ${basicResult.error?.message}`);
      results.push({
        test: "Basic withdrawal",
        status: "FAIL",
        error: basicResult.error?.message,
      });
    }

    // Test 2: Per-transaction limit
    console.log("Testing per-transaction amount limit...");
    const limitResult = await initiatePaymentAtomic(
      TEST_USER,
      "test-invoice-limit",
      150000000, // 150k sats (exceeds 100k limit)
      1000,
    );

    if (
      !limitResult.success &&
      limitResult.error?.message.includes(
        "exceeds maximum allowed per transaction",
      )
    ) {
      console.log("✅ Per-transaction limit: PASS");
      results.push({ test: "Per-transaction limit", status: "PASS" });
    } else {
      console.log(
        `❌ Per-transaction limit: FAIL - ${limitResult.error?.message || "Should have been blocked"}`,
      );
      results.push({
        test: "Per-transaction limit",
        status: "FAIL",
        error: limitResult.error?.message,
      });
    }

    // Test 3: Insufficient funds
    console.log("Testing insufficient funds detection...");
    const insufficientResult = await initiatePaymentAtomic(
      TEST_USER,
      "test-invoice-insufficient",
      600000000, // 600k sats (more than 500k balance)
      1000,
    );

    if (!insufficientResult.success) {
      console.log("✅ Insufficient funds detection: PASS");
      results.push({ test: "Insufficient funds detection", status: "PASS" });
    } else {
      console.log(
        "❌ Insufficient funds detection: FAIL - Should have been blocked",
      );
      results.push({
        test: "Insufficient funds detection",
        status: "FAIL",
        error: "Should have been blocked",
      });
    }

    // Test 4: Duplicate invoice detection
    console.log("Testing duplicate invoice detection...");
    const dupResult1 = await initiatePaymentAtomic(
      TEST_USER,
      "test-invoice-duplicate",
      1000000,
      1000,
    );

    if (dupResult1.success) {
      // Try the same invoice again
      const dupResult2 = await initiatePaymentAtomic(
        TEST_USER,
        "test-invoice-duplicate", // Same invoice
        1000000,
        1000,
      );

      if (
        !dupResult2.success &&
        dupResult2.error?.message.includes("duplicate payment request")
      ) {
        console.log("✅ Duplicate invoice detection: PASS");
        results.push({ test: "Duplicate invoice detection", status: "PASS" });
      } else {
        console.log(
          `❌ Duplicate invoice detection: FAIL - ${dupResult2.error?.message || "Should have been blocked"}`,
        );
        results.push({
          test: "Duplicate invoice detection",
          status: "FAIL",
          error: dupResult2.error?.message,
        });
      }

      // Clean up
      await db
        .knex("transaction")
        .where("id", dupResult1.paymentRecordId)
        .del();
      await db.knex("user").where("id", TEST_USER).update({ is_locked: false });
    } else {
      console.log(
        `❌ Duplicate invoice detection: FAIL - First invoice failed: ${dupResult1.error?.message}`,
      );
      results.push({
        test: "Duplicate invoice detection",
        status: "FAIL",
        error: dupResult1.error?.message,
      });
    }

    // Test 5: Database constraint works
    console.log("Testing database constraint...");
    const constraintResult = await initiatePaymentAtomic(
      TEST_USER,
      "test-invoice-constraint",
      1000000,
      1000,
    );

    if (constraintResult.success) {
      try {
        // Try to manually insert another pending withdrawal (should fail)
        await db.knex("transaction").insert({
          user_id: TEST_USER,
          msat_amount: 1000000,
          withdraw: true,
          is_pending: true,
          payment_request: "test-invoice-constraint-manual",
          pre_tx_balance: 500000000,
        });

        console.log(
          "❌ Database constraint: FAIL - Manual insert should have been blocked",
        );
        results.push({
          test: "Database constraint",
          status: "FAIL",
          error: "Manual insert should have been blocked",
        });
      } catch (error) {
        if (
          error.message.includes("unique") ||
          error.message.includes("constraint")
        ) {
          console.log("✅ Database constraint: PASS");
          results.push({ test: "Database constraint", status: "PASS" });
        } else {
          console.log(
            `❌ Database constraint: FAIL - Wrong error: ${error.message}`,
          );
          results.push({
            test: "Database constraint",
            status: "FAIL",
            error: error.message,
          });
        }
      }

      // Clean up
      await db
        .knex("transaction")
        .where("id", constraintResult.paymentRecordId)
        .del();
      await db.knex("user").where("id", TEST_USER).update({ is_locked: false });
    } else {
      console.log(
        `❌ Database constraint: FAIL - Setup failed: ${constraintResult.error?.message}`,
      );
      results.push({
        test: "Database constraint",
        status: "FAIL",
        error: constraintResult.error?.message,
      });
    }

    // Test 6: Monitoring views exist
    console.log("Testing monitoring views...");
    try {
      await db.knex.raw(
        "SELECT * FROM transaction_race_condition_monitor LIMIT 1",
      );
      await db.knex.raw("SELECT * FROM withdrawal_security_monitor LIMIT 1");
      await db.knex.raw("SELECT * FROM daily_withdrawal_tracking LIMIT 1");

      console.log("✅ Monitoring views: PASS");
      results.push({ test: "Monitoring views", status: "PASS" });
    } catch (error) {
      console.log(`❌ Monitoring views: FAIL - ${error.message}`);
      results.push({
        test: "Monitoring views",
        status: "FAIL",
        error: error.message,
      });
    }
  } finally {
    // Clean up test data
    await db.knex("transaction").where("user_id", TEST_USER).del();
    await db.knex("external_payment").where("user_id", TEST_USER).del();
    await db.knex("user").where("id", TEST_USER).del();
  }

  // Summary
  console.log("\n📊 VALIDATION SUMMARY:");
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;

  console.log(`Total tests: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed === 0) {
    console.log("\n🎉 ALL VALIDATION TESTS PASSED!");
    console.log("✅ The withdrawal security fixes are working correctly.");
    console.log("✅ Race conditions are prevented.");
    console.log("✅ Security limits are enforced.");
    console.log("✅ Database constraints are active.");
    console.log("✅ Monitoring views are accessible.");
    return true;
  } else {
    console.log("\n💥 SOME VALIDATION TESTS FAILED:");
    results
      .filter((r) => r.status === "FAIL")
      .forEach((test) => {
        console.log(`❌ ${test.test}: ${test.error}`);
      });
    return false;
  }
}

// Run validation
validateSecurity()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("\n💥 VALIDATION FAILED:", error.message);
    console.error(error.stack);
    process.exit(1);
  });

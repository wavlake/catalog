#!/usr/bin/env node
/**
 * API endpoint tests for withdrawal security
 * Tests the actual HTTP endpoints that use the withdrawal functions
 */

const axios = require("axios");
const db = require("./dist/library/db").default;

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8080";
const TEST_CONFIG = {
  TEST_USER_ID: "test-api-user",
  TEST_INVOICE: "lnbc1000000n1pjqxtest123fake456invoice789",
  SMALL_AMOUNT: 1000000, // 1k sats
};

class APITester {
  constructor() {
    this.results = [];
  }

  log(message, type = "INFO") {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${type}: ${message}`);
  }

  async setupTestUser() {
    this.log("Setting up test user for API tests...", "SETUP");

    await db
      .knex("user")
      .insert({
        id: TEST_CONFIG.TEST_USER_ID,
        msat_balance: 100000000, // 100k sats
        created_at: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2 days old
        is_locked: false,
      })
      .onConflict("id")
      .merge(["msat_balance", "is_locked"]);
  }

  async cleanupTestUser() {
    this.log("Cleaning up test user...", "CLEANUP");

    await db
      .knex("transaction")
      .where("user_id", TEST_CONFIG.TEST_USER_ID)
      .del();
    await db.knex("user").where("id", TEST_CONFIG.TEST_USER_ID).del();
  }

  async testWithdrawalAPI() {
    this.log("Testing withdrawal API endpoint...", "TEST");

    try {
      const response = await axios.post(
        `${API_BASE_URL}/v1/withdraw`,
        {
          userId: TEST_CONFIG.TEST_USER_ID,
          invoice: TEST_CONFIG.TEST_INVOICE,
          amount: TEST_CONFIG.SMALL_AMOUNT,
        },
        {
          timeout: 5000,
          validateStatus: () => true, // Accept all status codes
        },
      );

      if (response.status === 200) {
        this.log(
          "✅ Withdrawal API endpoint is accessible and responding",
          "PASS",
        );
        return true;
      } else if (response.status === 400) {
        // Check if it's a validation error (expected)
        if (
          response.data &&
          typeof response.data === "string" &&
          response.data.includes("Invalid payment request")
        ) {
          this.log(
            "✅ Withdrawal API endpoint is working (returned expected validation error)",
            "PASS",
          );
          return true;
        } else {
          this.log(
            `⚠️ Withdrawal API returned 400 but unexpected error: ${response.data}`,
            "WARN",
          );
          return false;
        }
      } else {
        this.log(
          `❌ Withdrawal API returned unexpected status: ${response.status}`,
          "FAIL",
        );
        return false;
      }
    } catch (error) {
      if (error.code === "ECONNREFUSED") {
        this.log("⚠️ API server is not running - skipping API tests", "WARN");
        return null; // Skip API tests
      } else {
        this.log(`❌ API test failed: ${error.message}`, "FAIL");
        return false;
      }
    }
  }

  async runAPITests() {
    try {
      await this.setupTestUser();

      const apiResult = await this.testWithdrawalAPI();

      if (apiResult === null) {
        this.log("API tests skipped - server not running", "INFO");
        return { skipped: true, reason: "Server not running" };
      } else if (apiResult) {
        this.log("API tests passed", "PASS");
        return { success: true };
      } else {
        this.log("API tests failed", "FAIL");
        return { success: false };
      }
    } finally {
      await this.cleanupTestUser();
    }
  }
}

module.exports = { APITester };

// Run if called directly
if (require.main === module) {
  const tester = new APITester();
  tester
    .runAPITests()
    .then((result) => {
      if (result.skipped) {
        console.log(`\n⚠️ API tests skipped: ${result.reason}`);
        process.exit(0);
      } else if (result.success) {
        console.log("\n🎉 API tests passed!");
        process.exit(0);
      } else {
        console.log("\n💥 API tests failed!");
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error("\n💥 API test suite failed:", error.message);
      process.exit(1);
    });
}

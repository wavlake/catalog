/**
 * Common transaction validation utilities
 * Addresses code duplication identified in PR review
 */

import db from "./db";
import log from "./logger";

export interface DuplicateTransactionResult {
  hasDuplicates: boolean;
  duplicateCount: number;
  transactions: Array<{
    id: number;
    user_id: string;
    created_at: Date;
    msat_amount: number;
  }>;
}

/**
 * Common function to detect duplicate pending withdrawal transactions
 * Uses proper timestamp ordering instead of MIN(id) as identified in PR review
 */
export async function detectDuplicatePendingWithdrawals(
  userId?: string,
  trx?: any,
): Promise<DuplicateTransactionResult> {
  const knex = trx || db.knex;

  try {
    // Build query to find duplicate pending withdrawals
    let query = knex("transaction as t")
      .select("t.id", "t.user_id", "t.created_at", "t.msat_amount")
      .where("t.withdraw", true)
      .andWhere("t.is_pending", true);

    // If specific user provided, filter by user
    if (userId) {
      query = query.andWhere("t.user_id", userId);
    }

    // Find transactions that are NOT the earliest for each user (using timestamp, not ID)
    query = query.whereNotExists(function () {
      this.select("*")
        .from("transaction as t2")
        .whereRaw("t2.user_id = t.user_id")
        .andWhere("t2.withdraw", true)
        .andWhere("t2.is_pending", true)
        .andWhereRaw("t2.created_at < t.created_at")
        // Handle edge case where created_at is exactly the same
        .orWhereRaw("(t2.created_at = t.created_at AND t2.id < t.id)");
    });

    const duplicateTransactions = await query.orderBy("t.created_at", "desc");

    return {
      hasDuplicates: duplicateTransactions.length > 0,
      duplicateCount: duplicateTransactions.length,
      transactions: duplicateTransactions,
    };
  } catch (error) {
    log.error("Error detecting duplicate pending withdrawals", {
      error: error.message,
      userId,
      validationRule: "duplicate_transaction_detection",
    });

    return {
      hasDuplicates: false,
      duplicateCount: 0,
      transactions: [],
    };
  }
}

/**
 * Check if a specific payment request (invoice) already exists
 * Prevents duplicate invoice processing
 */
export async function isDuplicatePaymentRequest(
  invoice: string,
  trx?: any,
): Promise<boolean> {
  if (!invoice) {
    return false;
  }

  const knex = trx || db.knex;

  try {
    const existingTransaction = await knex("transaction")
      .select("id", "payment_request", "created_at")
      .where("payment_request", invoice)
      .first();

    if (existingTransaction) {
      log.warn("Duplicate payment request detected", {
        invoice,
        existingTransactionId: existingTransaction.id,
        existingTransactionDate: existingTransaction.created_at,
        validationRule: "duplicate_payment_request",
      });
      return true;
    }

    return false;
  } catch (error) {
    log.error("Error checking for duplicate payment request", {
      error: error.message,
      invoice,
      validationRule: "duplicate_payment_request",
    });
    return false;
  }
}

/**
 * Get the earliest pending withdrawal for a user using proper timestamp ordering
 * Replaces MIN(id) usage identified in PR review
 */
export async function getEarliestPendingWithdrawal(
  userId: string,
  trx?: any,
): Promise<any> {
  const knex = trx || db.knex;

  try {
    const earliestWithdrawal = await knex("transaction")
      .select("id", "created_at", "msat_amount", "payment_request")
      .where("user_id", userId)
      .andWhere("withdraw", true)
      .andWhere("is_pending", true)
      .orderBy("created_at", "asc")
      .orderBy("id", "asc") // Secondary sort for identical timestamps
      .first();

    return earliestWithdrawal || null;
  } catch (error) {
    log.error("Error getting earliest pending withdrawal", {
      error: error.message,
      userId,
      validationRule: "earliest_pending_withdrawal",
    });
    return null;
  }
}

/**
 * Archive duplicate transactions with proper metadata
 * Provides safe cleanup of race condition duplicates
 */
export async function archiveDuplicateTransactions(
  duplicateTransactions: Array<{ id: number; user_id: string }>,
  reason: string,
  trx?: any,
): Promise<boolean> {
  if (duplicateTransactions.length === 0) {
    return true;
  }

  const knex = trx || db.knex;

  try {
    // First, archive the transactions
    const transactionIds = duplicateTransactions.map((t) => t.id);

    // Create archive records with metadata
    await knex.raw(
      `
      INSERT INTO transaction_race_condition_archive 
      SELECT 
        t.*,
        now() as archived_at,
        ? as archive_reason,
        'duplicate_pending_withdrawal' as violation_type
      FROM "transaction" t
      WHERE t.id = ANY(?)
    `,
      [reason, transactionIds],
    );

    // Mark original transactions as failed
    await knex("transaction")
      .update({
        is_pending: false,
        success: false,
        failure_reason: `Cancelled during cleanup - ${reason}`,
        updated_at: knex.fn.now(),
      })
      .whereIn("id", transactionIds);

    log.info(
      `Archived ${duplicateTransactions.length} duplicate transactions`,
      {
        transactionIds,
        reason,
        userIds: [...new Set(duplicateTransactions.map((t) => t.user_id))],
        validationRule: "duplicate_transaction_archive",
      },
    );

    return true;
  } catch (error) {
    log.error("Error archiving duplicate transactions", {
      error: error.message,
      duplicateTransactions,
      reason,
      validationRule: "duplicate_transaction_archive",
    });
    return false;
  }
}

export default {
  detectDuplicatePendingWithdrawals,
  isDuplicatePaymentRequest,
  getEarliestPendingWithdrawal,
  archiveDuplicateTransactions,
};

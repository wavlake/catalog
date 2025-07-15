const log = require("loglevel");
import db from "./db";
import { checkUserHasSufficientSats, getUserBalance } from "./userHelper";
import { sendPayment } from "./zbd";
import { ZBDSendPaymentResponse } from "./zbd/responseInterfaces";
import { PaymentStatus } from "./zbd/constants";
import { IncomingInvoiceType } from "./common";

// AGGRESSIVE WITHDRAWAL SECURITY CONFIGURATION
const WITHDRAWAL_SECURITY_CONFIG = {
  MIN_TIME_BETWEEN_ATTEMPTS: 30000, // 30 seconds
  MAX_ATTEMPTS_PER_MINUTE: 3,
  DAILY_WITHDRAWAL_LIMIT: 400000000, // 400k sats = 400000000 msats
  COOLDOWN_AFTER_RAPID_ATTEMPTS: 300000, // 5 minutes
  SUSPICIOUS_ACTIVITY_THRESHOLD: 5, // Failed attempts in 1 hour
  MAX_AMOUNT_PER_WITHDRAWAL: 100000000, // 100k sats = 100000000 msats
  MIN_ACCOUNT_AGE_FOR_LARGE_WITHDRAWALS: 86400000, // 24 hours in milliseconds
};

async function checkUserHasPendingTx(userId: string): Promise<boolean> {
  return db
    .knex("transaction")
    .select("transaction.id as id", "transaction.is_pending as isPending")
    .where("transaction.user_id", "=", userId)
    .andWhere("transaction.withdraw", "=", true) // Only check withdraws
    .andWhere("transaction.is_pending", "=", true)
    .then((data) => {
      if (data.length > 0) {
        return true;
      } else {
        return false;
      }
    })
    .catch((err) => {
      log.info(
        `Error in checkUserHasPendingTx querying transaction table: ${err}`,
      );
      return false;
    });
}

// DEPRECATED: This function is replaced by atomic payment record creation
// in initiatePaymentAtomic to prevent race conditions
async function createPaymentRecord(
  userId: string,
  invoice: string,
  valueMsat: number,
): Promise<number> {
  const userBalance = await getUserBalance(userId);
  return db
    .knex("transaction")
    .insert(
      {
        user_id: userId,
        pre_tx_balance: userBalance,
        payment_request: invoice,
        msat_amount: valueMsat,
        withdraw: true,
        is_pending: true,
      },
      ["id"],
    )
    .then((data) => {
      if (!data[0]?.id) {
        log.error(
          `Error inserting new payment record into transaction table: ${data}`,
        );
        return null;
      }
      return data[0]?.id;
    })
    .catch((err) => {
      log.info(
        `Error inserting new payment record into transaction table: ${err}`,
      );
      return null;
    });
}

async function handleCompletedPayment(
  res: any, // TODO: Use express response type
  userId: string,
  msatAmount: number,
  paymentRecordId: number,
  paymentData: ZBDSendPaymentResponse,
) {
  if (paymentData.success === false) {
    log.error(
      `handleCompletedPayment called with unsuccessful paymentData: ${JSON.stringify(
        paymentData,
      )}`,
    );
    throw new Error(paymentData.message);
  }

  const totalAmount = msatAmount + parseInt(paymentData.data.fee);
  const userBalance = await getUserBalance(userId);
  // Check if the payment amount + final fee is greater than the user's balance
  let substituteFeeAmount;
  if (parseInt(userBalance) < totalAmount) {
    log.info(
      `Total transaction amount exceeds user balance for ${userId} with ${userBalance} msats`,
    );
    log.info(
      `Transaction total: ${msatAmount} msats + ${paymentData.data.fee} msats`,
    );
    substituteFeeAmount = Math.abs(parseInt(userBalance) - totalAmount);
  }

  const trx = await db.knex.transaction();
  // Update transaction table and user balance in one tx
  return trx("transaction")
    .update({
      fee_msat: paymentData.data.fee,
      payment_request: paymentData.data.invoice,
      success: true,
      is_pending: false,
      external_id: paymentData.data.id,
      preimage: paymentData.data.preimage,
    })
    .where({ id: paymentRecordId })
    .then(() => {
      // Decrement balance and unlock user
      return trx("user")
        .decrement({
          msat_balance: substituteFeeAmount
            ? msatAmount + parseInt(substituteFeeAmount)
            : totalAmount,
        })
        .update({ updated_at: db.knex.fn.now(), is_locked: false })
        .where({ id: userId });
    })
    .then(trx.commit)
    .then(() => {
      log.info(`Payment successful for ${userId}`);
      return res
        ? res.status(200).send({
            success: true,
            data: { invoiceId: paymentRecordId, ...paymentData.data },
          })
        : {
            success: true,
            data: {
              invoiceId: paymentRecordId,
              preimage: paymentData.data.preimage,
              feeMsat: paymentData.data.fee,
            },
          };
    })
    .catch((err) => {
      log.error(
        `Error updating transaction table on handleCompletedPayment: ${err}`,
      );
      return res
        ? res.status(500).send("Payment succeeded but update failed")
        : { success: false, error: "UNKNOWN" };
    });
}

async function handleFailedPayment(
  res: any, // TODO: Use express response type
  userId: string,
  paymentRecordId: number,
  paymentData: ZBDSendPaymentResponse,
) {
  const trx = await db.knex.transaction();
  // Update transaction table and user status
  return trx("transaction")
    .update({
      success: false,
      is_pending: false,
      failure_reason: paymentData.message,
    })
    .where({ id: paymentRecordId })
    .then(() => {
      // Unlock user
      return trx("user")
        .update({ updated_at: db.knex.fn.now(), is_locked: false })
        .where({ id: userId });
    })
    .then(trx.commit)
    .then(() => {
      log.info(`Payment failed for ${userId}`);
      return res
        ? res.status(400).send(`Payment failed: ${paymentData.message}`)
        : { success: false, error: paymentData.message };
    })
    .catch((err) => {
      log.error(
        `Error updating transaction table on handleFailedPayment: ${err}`,
      );
      return res
        ? res.status(500).send("Update failed on failed payment")
        : { success: false, error: "UNKNOWN" };
    });
}

async function isDuplicatePayRequest(invoice: string): Promise<boolean> {
  return db
    .knex("transaction")
    .select("payment_request")
    .where("payment_request", "=", invoice)
    .then((data) => {
      return data.length > 0;
    })
    .catch((e) => {
      log.error(`Error looking up invoice: ${e}`);
      return null;
    });
}

export const runPaymentChecks = async (
  userId: string,
  invoice: string,
  msatAmount: number,
  msatMaxFee: number,
): Promise<{
  success: boolean;
  error?: { message: string };
}> => {
  const userHasPending = await checkUserHasPendingTx(userId);
  if (userHasPending) {
    log.info(
      `Withdraw request canceled for user: ${userId} another tx is pending`,
    );
    return {
      success: false,
      error: {
        message: "Another transaction is pending, please try again later",
      },
    };
  }

  if (invoice) {
    const isDupe = await isDuplicatePayRequest(invoice);
    if (isDupe) {
      log.info(
        `Withdraw request canceled for user: ${userId} duplicate payment request`,
      );
      return {
        success: false,
        error: {
          message: "Unable to process payment, duplicate payment request",
        },
      };
    }
  }

  const totalAmount = msatAmount + msatMaxFee;
  const userHasSufficientSats = await checkUserHasSufficientSats(
    userId,
    totalAmount,
  );

  if (!userHasSufficientSats) {
    return {
      success: false,
      error: {
        message: "Insufficient funds to cover payment and transaction fees",
      },
    };
  }

  return { success: true };
};

/**
 * Atomically validates user balance and locks user to prevent race conditions
 * This replaces the separate balance check and user locking operations
 */
export const initiatePaymentAtomic = async (
  userId: string,
  invoice: string,
  msatAmount: number,
  msatMaxFee: number,
): Promise<{
  success: boolean;
  paymentRecordId?: number;
  error?: { message: string };
}> => {
  const totalAmount = msatAmount + msatMaxFee;

  const trx = await db.knex.transaction();
  try {
    // Check for duplicate payment request first (outside of user lock)
    if (invoice) {
      const isDupe = await trx("transaction")
        .select("payment_request")
        .where("payment_request", "=", invoice)
        .first();

      if (isDupe) {
        log.info(
          `Withdraw request canceled for user: ${userId} duplicate payment request`,
        );
        await trx.rollback();
        return {
          success: false,
          error: {
            message: "Unable to process payment, duplicate payment request",
          },
        };
      }
    }

    // Atomically check balance, pending transactions, and lock user
    const user = await trx("user")
      .select("msat_balance", "is_locked", "created_at")
      .where("id", userId)
      .forUpdate()
      .first();

    if (!user) {
      await trx.rollback();
      return {
        success: false,
        error: { message: "User not found" },
      };
    }

    if (user.is_locked) {
      await trx.rollback();
      return {
        success: false,
        error: {
          message: "Another transaction is pending, please try again later",
        },
      };
    }

    // Check for pending transactions
    const pendingTx = await trx("transaction")
      .select("id", "created_at")
      .where("user_id", userId)
      .andWhere("withdraw", true)
      .andWhere("is_pending", true)
      .first();

    if (pendingTx) {
      await trx.rollback();
      log.warn(
        `User ${userId} attempted withdrawal with pending transaction ${pendingTx.id}`,
      );
      return {
        success: false,
        error: {
          message: "Another transaction is pending, please try again later",
        },
      };
    }

    // AGGRESSIVE: Check for recent withdrawal attempts (rate limiting)
    const recentWithdrawals = await trx("transaction")
      .select("id", "created_at", "success")
      .where("user_id", userId)
      .andWhere("withdraw", true)
      .andWhere("created_at", ">=", trx.raw("NOW() - INTERVAL '1 minute'"))
      .orderBy("created_at", "desc");

    if (recentWithdrawals.length > 0) {
      const lastWithdrawal = recentWithdrawals[0];
      const timeSinceLastAttempt =
        Date.now() - new Date(lastWithdrawal.created_at).getTime();

      // Require minimum time between withdrawal attempts
      if (
        timeSinceLastAttempt <
        WITHDRAWAL_SECURITY_CONFIG.MIN_TIME_BETWEEN_ATTEMPTS
      ) {
        await trx.rollback();
        log.warn(
          `User ${userId} attempted withdrawal too quickly. Last attempt: ${timeSinceLastAttempt}ms ago`,
        );
        return {
          success: false,
          error: {
            message: `Please wait at least ${
              WITHDRAWAL_SECURITY_CONFIG.MIN_TIME_BETWEEN_ATTEMPTS / 1000
            } seconds between withdrawal attempts`,
          },
        };
      }

      // AGGRESSIVE: Progressive delay for rapid attempts
      if (
        recentWithdrawals.length >=
        WITHDRAWAL_SECURITY_CONFIG.MAX_ATTEMPTS_PER_MINUTE
      ) {
        await trx.rollback();
        log.warn(
          `User ${userId} made ${recentWithdrawals.length} withdrawal attempts in last minute - blocking`,
        );
        return {
          success: false,
          error: {
            message: `Too many withdrawal attempts. Please wait ${
              WITHDRAWAL_SECURITY_CONFIG.COOLDOWN_AFTER_RAPID_ATTEMPTS /
              1000 /
              60
            } minutes before trying again`,
          },
        };
      }
    }

    // AGGRESSIVE: Daily withdrawal limit check
    const dailyWithdrawals = await trx("transaction")
      .sum("msat_amount as totalWithdrawn")
      .where("user_id", userId)
      .andWhere("withdraw", true)
      .andWhere("success", true)
      .andWhere("created_at", ">=", trx.raw("NOW() - INTERVAL '24 hours'"))
      .first();

    const dailyWithdrawnAmount = parseInt(
      dailyWithdrawals?.totalWithdrawn || 0,
    );

    if (
      dailyWithdrawnAmount + totalAmount >
      WITHDRAWAL_SECURITY_CONFIG.DAILY_WITHDRAWAL_LIMIT
    ) {
      await trx.rollback();
      log.warn(
        `User ${userId} exceeded daily withdrawal limit: ${
          dailyWithdrawnAmount + totalAmount
        } > ${WITHDRAWAL_SECURITY_CONFIG.DAILY_WITHDRAWAL_LIMIT}`,
      );
      return {
        success: false,
        error: {
          message: "Daily withdrawal limit exceeded. Please try again tomorrow",
        },
      };
    }

    // AGGRESSIVE: Per-transaction amount limit
    if (totalAmount > WITHDRAWAL_SECURITY_CONFIG.MAX_AMOUNT_PER_WITHDRAWAL) {
      await trx.rollback();
      log.warn(
        `User ${userId} attempted withdrawal exceeding per-transaction limit: ${totalAmount} > ${WITHDRAWAL_SECURITY_CONFIG.MAX_AMOUNT_PER_WITHDRAWAL}`,
      );
      return {
        success: false,
        error: {
          message: "Withdrawal amount exceeds maximum allowed per transaction",
        },
      };
    }

    // AGGRESSIVE: Account age check for large withdrawals
    const LARGE_WITHDRAWAL_THRESHOLD = 10000000; // 10k sats
    if (totalAmount > LARGE_WITHDRAWAL_THRESHOLD) {
      const accountAge =
        Date.now() - new Date(user.created_at || new Date()).getTime();
      if (
        accountAge <
        WITHDRAWAL_SECURITY_CONFIG.MIN_ACCOUNT_AGE_FOR_LARGE_WITHDRAWALS
      ) {
        await trx.rollback();
        log.warn(
          `User ${userId} attempted large withdrawal with new account: age=${accountAge}ms, amount=${totalAmount}`,
        );
        return {
          success: false,
          error: {
            message:
              "Large withdrawals require account to be at least 24 hours old",
          },
        };
      }
    }

    // AGGRESSIVE: Suspicious activity detection
    const recentFailures = await trx("transaction")
      .count("id as failureCount")
      .where("user_id", userId)
      .andWhere("withdraw", true)
      .andWhere("success", false)
      .andWhere("created_at", ">=", trx.raw("NOW() - INTERVAL '1 hour'"))
      .first();

    const failureCount = parseInt(String(recentFailures?.failureCount || 0));
    if (
      failureCount >= WITHDRAWAL_SECURITY_CONFIG.SUSPICIOUS_ACTIVITY_THRESHOLD
    ) {
      await trx.rollback();
      log.error(
        `User ${userId} flagged for suspicious activity: ${failureCount} failed withdrawals in past hour`,
      );
      return {
        success: false,
        error: {
          message:
            "Account temporarily restricted due to suspicious activity. Please contact support",
        },
      };
    }

    // Calculate total in-flight amounts with single optimized query
    const inflightAmounts = await trx.raw(
      `
      SELECT 
        COALESCE(SUM(msat_amount), 0) as total_amount,
        COALESCE(SUM(fee_msat), 0) as total_fee
      FROM (
        SELECT msat_amount, fee_msat 
        FROM external_payment 
        WHERE is_pending = true AND user_id = ?
        UNION ALL
        SELECT msat_amount, fee_msat 
        FROM "transaction" 
        WHERE is_pending = true AND user_id = ? AND withdraw = true
      ) combined_pending
    `,
      [userId, userId],
    );

    const inFlightSats =
      parseInt(inflightAmounts.rows[0]?.total_amount || 0) +
      parseInt(inflightAmounts.rows[0]?.total_fee || 0);

    // Check if user has sufficient balance with detailed validation
    const currentBalance = parseInt(user.msat_balance);
    const availableBalance = currentBalance - inFlightSats;

    if (availableBalance < totalAmount) {
      await trx.rollback();
      log.warn(
        `Insufficient funds for user ${userId}: available=${availableBalance}, required=${totalAmount}, balance=${currentBalance}, inFlight=${inFlightSats}`,
      );
      return {
        success: false,
        error: {
          message: "Insufficient funds to cover payment and transaction fees",
        },
      };
    }

    // Additional safety check: ensure transaction won't result in negative balance
    const projectedBalance = currentBalance - totalAmount;
    if (projectedBalance < 0) {
      await trx.rollback();
      log.error(
        `Transaction would cause negative balance for user ${userId}: current=${currentBalance}, amount=${totalAmount}, projected=${projectedBalance}`,
      );
      return {
        success: false,
        error: {
          message: "Transaction would result in negative balance",
        },
      };
    }

    // Lock user and create transaction record atomically
    await trx("user").update({ is_locked: true }).where("id", userId);

    const [paymentRecord] = await trx("transaction")
      .insert({
        user_id: userId,
        pre_tx_balance: user.msat_balance,
        payment_request: invoice,
        msat_amount: msatAmount,
        withdraw: true,
        is_pending: true,
      })
      .returning("id");

    await trx.commit();

    log.info(
      `Atomically validated and locked user ${userId} for payment of ${msatAmount} msats`,
    );

    return {
      success: true,
      paymentRecordId: paymentRecord.id,
    };
  } catch (err) {
    await trx.rollback();
    log.error(`Error in atomic payment initiation: ${err}`);
    return {
      success: false,
      error: { message: "Failed to initiate payment" },
    };
  }
};

export const initiatePayment = async (
  res: any, // TODO: Use express response types
  userId: string,
  invoice: string,
  msatAmount: number,
  msatMaxFee: number,
) => {
  log.info(
    `Initiating payment of ${msatAmount} msats for ${userId} with max fee ${msatMaxFee} msats`,
  );

  // Use atomic balance validation and user locking
  const atomicResult = await initiatePaymentAtomic(
    userId,
    invoice,
    msatAmount,
    msatMaxFee,
  );

  if (!atomicResult.success) {
    log.info(
      `Payment initiation failed for ${userId}: ${atomicResult.error?.message}`,
    );
    return res
      ? res
          .status(400)
          .send(`Invalid payment request: ${atomicResult.error?.message}`)
      : { success: false, error: atomicResult.error?.message };
  }

  const paymentRecordId = atomicResult.paymentRecordId!;

  // Attempt payment
  const paymentResponse = await sendPayment({
    description: "Withdrawal",
    amount: msatAmount.toString(),
    invoice: invoice,
    internalId: `${
      IncomingInvoiceType.Transaction
    }-${paymentRecordId.toString()}`,
  });

  if (!paymentResponse.success) {
    log.error(`Error sending payment: ${paymentResponse.message}`);
    await handleFailedPayment(res, userId, paymentRecordId, paymentResponse);
    return;
  }
  // Wrap in a try/catch to handle timeouts
  try {
    // Payment failed
    if (paymentResponse.data.status === PaymentStatus.Error) {
      log.error(`Send payment error status: ${paymentResponse.message}`);

      await handleFailedPayment(res, userId, paymentRecordId, paymentResponse);
      return;
    } else {
      if (paymentResponse.data.status === PaymentStatus.Completed) {
        // Handle completed payment
        await handleCompletedPayment(
          res,
          userId,
          msatAmount,
          paymentRecordId,
          paymentResponse,
        );
      }
      return { success: true, data: { ...paymentResponse.data } };
    }
  } catch (e) {
    log.error(`Error processing payment: ${e}`);
    return res.status(500).send("An unknown error occurred");
  }
};

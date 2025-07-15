const log = require("loglevel");
import db from "./db";
import { checkUserHasSufficientSats, getUserBalance } from "./userHelper";
import { sendPayment } from "./zbd";
import { ZBDSendPaymentResponse } from "./zbd/responseInterfaces";
import { PaymentStatus } from "./zbd/constants";
import { IncomingInvoiceType } from "./common";

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
      .select("msat_balance", "is_locked")
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
      .select("id")
      .where("user_id", userId)
      .andWhere("withdraw", true)
      .andWhere("is_pending", true)
      .first();

    if (pendingTx) {
      await trx.rollback();
      return {
        success: false,
        error: {
          message: "Another transaction is pending, please try again later",
        },
      };
    }

    // Calculate total in-flight amounts
    const inflightKeysends = await trx("external_payment")
      .sum("msat_amount as totalAmount")
      .sum("fee_msat as totalFee")
      .where("is_pending", true)
      .andWhere("user_id", userId)
      .first();

    const inflightTransactions = await trx("transaction")
      .sum("msat_amount as totalAmount")
      .sum("fee_msat as totalFee")
      .where("is_pending", true)
      .andWhere("user_id", userId)
      .andWhere("withdraw", true)
      .first();

    const inFlightSats =
      parseInt(inflightKeysends?.totalAmount || 0) +
      parseInt(inflightKeysends?.totalFee || 0) +
      parseInt(inflightTransactions?.totalAmount || 0) +
      parseInt(inflightTransactions?.totalFee || 0);

    // Check if user has sufficient balance
    const availableBalance = parseInt(user.msat_balance) - inFlightSats;
    if (availableBalance < totalAmount) {
      await trx.rollback();
      return {
        success: false,
        error: {
          message: "Insufficient funds to cover payment and transaction fees",
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

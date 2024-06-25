const log = require("loglevel");
import db from "./db";
import { checkUserHasSufficientSats, getUserBalance } from "./userHelper";
import { sendPayment } from "./zbd";
import { ZBDSendPaymentResponse } from "./zbd/responseInterfaces";
import { PaymentStatus } from "./zbd/constants";

async function checkUserHasPendingTx(userId: string): Promise<boolean> {
  return db
    .knex("transaction")
    .select("transaction.id as id", "transaction.is_pending as isPending")
    .where("transaction.user_id", "=", userId)
    .andWhere("transaction.is_pending", "=", true)
    .then((data) => {
      if (data.length > 0) {
        return true;
      } else {
        return false;
      }
    })
    .catch((err) => {
      log.debug(
        `Error in checkUserHasPendingTx querying transaction table: ${err}`
      );
      return false;
    });
}

async function createPaymentRecord(
  userId: string,
  invoice: string,
  valueMsat: number
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
      ["id"]
    )
    .then((data) => {
      if (!data[0]?.id) {
        log.error(
          `Error inserting new payment record into transaction table: ${data}`
        );
        return null;
      }
      return data[0]?.id;
    })
    .catch((err) => {
      log.debug(
        `Error inserting new payment record into transaction table: ${err}`
      );
      return null;
    });
}

async function handleCompletedPayment(
  res: any, // TODO: Use express response type
  userId: string,
  msatAmount: number,
  paymentRecordId: number,
  paymentData: ZBDSendPaymentResponse
) {
  const totalAmount = msatAmount + parseInt(paymentData.data.fee);
  const userBalance = await getUserBalance(userId);
  // Check if the payment amount + final fee is greater than the user's balance
  let substituteFeeAmount;
  if (parseInt(userBalance) < totalAmount) {
    log.debug(
      `Total transaction amount exceeds user balance for ${userId} with ${userBalance} msats`
    );
    log.debug(
      `Transaction total: ${msatAmount} msats + ${paymentData.data.fee} msats`
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
            ? totalAmount
            : msatAmount + substituteFeeAmount,
        })
        .update({ updated_at: db.knex.fn.now(), is_locked: false })
        .where({ id: userId });
    })
    .then(trx.commit)
    .then(() => {
      log.debug(`Payment successful for ${userId}`);
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
        `Error updating transaction table on handleCompletedPayment: ${err}`
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
  paymentData: ZBDSendPaymentResponse
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
      log.debug(`Payment failed for ${userId}`);
      return res
        ? res.status(400).send(`Payment failed: ${paymentData.message}`)
        : { success: false, error: paymentData.message };
    })
    .catch((err) => {
      log.error(
        `Error updating transaction table on handleFailedPayment: ${err}`
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
  msatMaxFee: number
): Promise<any> => {
  const userHasPending = await checkUserHasPendingTx(userId);
  if (userHasPending) {
    log.info(
      `Withdraw request canceled for user: ${userId} another tx is pending`
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
        `Withdraw request canceled for user: ${userId} duplicate payment request`
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
    totalAmount
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

export const initiatePayment = async (
  res: any, // TODO: Use express response types
  userId: string,
  invoice: string,
  msatAmount: number,
  msatMaxFee: number
) => {
  log.debug(
    `Initiating payment of ${msatAmount} msats for ${userId} with max fee ${msatMaxFee} msats`
  );

  // Lock user
  await db.knex("user").where("id", "=", userId).update({ is_locked: true });

  const paymentRecordId = await createPaymentRecord(
    userId,
    invoice,
    msatAmount
  );

  // Attempt payment
  const paymentResponse = await sendPayment({
    description: "Withdrawal",
    amount: msatAmount.toString(),
    invoice: invoice,
    internalId: `transaction-${paymentRecordId.toString()}`,
  });

  // Wrap in a try/catch to handle timeouts
  try {
    // Payment failed
    if (
      !paymentResponse.success &&
      paymentResponse.data.status === PaymentStatus.Error
    ) {
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
          paymentResponse
        );
      }
      return { success: true, data: { ...paymentResponse.data } };
    }
  } catch (e) {
    log.error(`Error processing payment: ${e}`);
    return res.status(500).send("An unknown error occurred");
  }
};

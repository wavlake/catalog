const log = require("loglevel");
import db from "./db";
import { checkUserHasSufficientSats, getUserBalance } from "./userHelper";
import { sendPayment } from "./zbdClient";
import { sendPaymentResponse } from "../types/zbd";

const checkUserHasPendingTx = async (userId: string): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    db.knex("transaction")
      .select("transaction.id as id", "transaction.is_pending as isPending")
      .where("transaction.user_id", "=", userId)
      .andWhere("transaction.is_pending", "=", true)
      .then((data) => {
        if (data.length > 0) {
          resolve(true);
        } else {
          resolve(false);
        }
      })
      .catch((err) => {
        log.debug(
          `Error in checkUserHasPendingTx querying transaction table: ${err}`
        );
        reject();
      });
  });
};

async function createPaymentRecord(
  userId: string,
  invoice: string,
  valueMsat: number
): Promise<number> {
  const userBalance = await getUserBalance(userId);
  return new Promise((resolve, reject) => {
    db.knex("transaction")
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
          reject();
        }
        resolve(data[0]?.id);
      })
      .catch((err) => {
        log.debug(
          `Error inserting new payment record into transaction table: ${err}`
        );
        reject();
      });
  });
}

async function handleCompletedPayment(
  res: any, // TODO: Use express response type
  userId: string,
  msatAmount: number,
  paymentRecordId: number,
  paymentData: sendPaymentResponse
) {
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
          msat_balance: msatAmount + parseInt(paymentData.data.fee),
        })
        .update({ updated_at: db.knex.fn.now(), is_locked: false })
        .where({ id: userId });
    })
    .then(trx.commit)
    .then(() => {
      log.debug(`Payment successful for ${userId}`);
      return res
        ? res
            .status(200)
            .send({ invoiceId: paymentRecordId, ...paymentData.data })
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
  paymentData: sendPaymentResponse
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

async function isDuplicatePayRequest(invoice) {
  return new Promise((resolve, reject) => {
    return db
      .knex("transaction")
      .select("payment_request")
      .where("payment_request", "=", invoice)
      .then((data) => {
        resolve(data.length > 0);
      })
      .catch((e) => {
        log.error(`Error looking up invoice: ${e}`);
        reject();
      });
  });
}

const runPaymentChecks = async (
  res: any, // TODO: Use express response type
  userId: string,
  invoice: string,
  msatAmount: number,
  msatMaxFee: number
) => {
  const userHasPending = await checkUserHasPendingTx(userId);
  if (userHasPending) {
    log.info(
      `Withdraw request canceled for user: ${userId} another tx is pending`
    );
    return res
      ? res
          .status(400)
          .send("Another transaction is pending, please try again later")
      : { success: false, error: "Another transaction is pending" };
  }

  const isDupe = await isDuplicatePayRequest(invoice);
  if (isDupe) {
    log.info(
      `Withdraw request canceled for user: ${userId} duplicate payment request`
    );
    return res
      ? res
          .status(400)
          .send("Unable to process payment, duplicate payment request")
      : { success: false, error: "Duplicate payment request" };
  }

  const totalAmount = msatAmount + msatMaxFee;
  const userHasSufficientSats = await checkUserHasSufficientSats(
    userId,
    totalAmount
  );

  if (!userHasSufficientSats) {
    return res
      ? res.status(400).send("Insufficient funds")
      : { success: false, error: "Insufficient funds" };
  }

  return { success: true };
};

const initiatePayment = async (
  res: any, // TODO: Use express response types
  next: any,
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
    internalId: paymentRecordId.toString(),
    callbackUrl: `${process.env.ZBD_CALLBACK_URL}/payments/callback/zbd`,
  });

  log.debug(`Payment response: ${JSON.stringify(paymentResponse)}`);
  // Something failed
  if (!paymentResponse.success) {
    await handleFailedPayment(res, userId, paymentRecordId, paymentResponse);
  } else {
    if (paymentResponse.data.status === "completed") {
      // Handle completed payment
      await handleCompletedPayment(
        res,
        userId,
        msatAmount,
        paymentRecordId,
        paymentResponse
      );
      return;
    } else {
      // Payment is pending
      return res
        ? res.status(200).send({
            success: true,
            data: { status: paymentResponse.data.status },
          })
        : { success: true, status: paymentResponse.data.status };
    }
  }

  // return sendPayment;
};

module.exports = {
  checkUserHasPendingTx,
  initiatePayment,
  runPaymentChecks,
};

import { getUserIdFromTransactionId } from "./deposit";
import { PaymentStatus } from "./zbd/constants";
import log from "loglevel";
import db from "./db";

export const handleCompletedForward = async ({
  externalPaymentId,
  status,
  msatAmount,
  fee,
  preimage,
}: {
  externalPaymentId: string;
  status: PaymentStatus;
  msatAmount: number;
  fee: number;
  preimage: string;
}): Promise<boolean> => {
  log.debug(
    `Received forward callback for ${externalPaymentId}, status: ${status}`
  );
  const trx = await db.knex.transaction();
  return (
    // updates all records with the same external_payment_id that is not a remainder
    trx("forward")
      .update({
        in_flight: false,
        is_settled: status === PaymentStatus.Completed,
        updated_at: db.knex.fn.now(),
      })
      .increment("attempt_count", 1)
      .where({ external_payment_id: externalPaymentId })
      .then(() => {
        // Update remainder record
        if (status === PaymentStatus.Completed) {
          return trx("forward")
            .update({
              in_flight: false,
              updated_at: db.knex.fn.now(),
            })
            .where({
              remainder_id: externalPaymentId,
            });
        } else {
          // Delete remainder record if not successful
          return trx("forward").delete().where({
            remainder_id: externalPaymentId,
            is_remainder: true,
          });
        }
      })
      .then(() => {
        // Store payment details
        return trx("forward_detail").insert({
          external_payment_id: externalPaymentId,
          msat_amount: msatAmount,
          fee_msat: fee,
          success: status === PaymentStatus.Completed,
          preimage: preimage,
        });
      })
      .then(trx.commit)
      .then(() => {
        log.debug(`Successfully logged forward for ${externalPaymentId}`);
        return true;
      })
      .catch((err) => {
        log.error(
          `Error updating forward table on handleCompletedForward: ${err}`
        );
        return false;
      })
  );
};

export const handleCompletedWithdrawal = async ({
  transactionId,
  msatAmount,
  status,
  fee,
  preimage,
}: {
  transactionId: number;
  msatAmount: number;
  status: PaymentStatus;
  fee: number;
  preimage: string;
}): Promise<boolean> => {
  const userId = await getUserIdFromTransactionId(transactionId);
  const trx = await db.knex.transaction();
  // Update transaction table and user balance in one tx
  return trx("transaction")
    .update({
      success: status === PaymentStatus.Completed,
      is_pending: false,
      updated_at: db.knex.fn.now(),
      fee_msat: fee,
      preimage: preimage,
    })
    .where({ id: transactionId })
    .then(() => {
      if (status === PaymentStatus.Completed) {
        // Decrement user balance and unlock user
        return trx("user")
          .decrement({
            msat_balance: msatAmount + fee,
          })
          .update({ updated_at: db.knex.fn.now(), is_locked: false })
          .where({ id: userId });
      } else {
        return;
      }
    })
    .then(trx.commit)
    .then(() => {
      log.debug(
        `Successfully logged withdrawal of ${msatAmount} for ${userId}`
      );
      return true;
    })
    .catch((err) => {
      log.error(
        `Error updating transaction table on handleCompletedWithdrawal: ${err}`
      );
      return false;
    });
};
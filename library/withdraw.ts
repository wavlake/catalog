import { getUserIdFromTransactionId } from "./deposit";
import { PaymentStatus } from "./zbd/constants";
import log from "loglevel";
import db from "./db";

export const handleCompletedForward = async ({
  externalPaymentId,
  status,
}: {
  externalPaymentId: string;
  status: PaymentStatus;
}): Promise<boolean> => {
  if (status === PaymentStatus.Completed) {
    const trx = await db.knex.transaction();
    return trx("forward")
      .update({
        in_flight: false,
        is_settled: true,
        updated_at: db.knex.fn.now(),
      })
      .where({ external_payment_id: externalPaymentId })
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
      });
  }
  return true;
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

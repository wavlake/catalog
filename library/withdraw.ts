import { getUserIdFromTransactionId } from "./deposit";
import { PaymentStatus } from "./zbd/constants";
import log from "loglevel";
import db from "./db";

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
        // Increment user balance and unlock user
        return trx("user")
          .decrement({
            msat_balance: msatAmount,
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

import { getUserIdFromTransactionId } from "./deposit";
import { PaymentStatus } from "./zbd/constants";
import log from "./logger";
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
  log.info(
    `Received forward callback for ${externalPaymentId}, status: ${status}`,
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
          });
        }
      })
      .then(() => {
        // Check if forward_detail record already exists to prevent duplicates
        return trx("forward_detail")
          .where({ external_payment_id: externalPaymentId })
          .first()
          .then((existingRecord) => {
            if (existingRecord) {
              log.warn(
                `Forward detail already exists for ${externalPaymentId}, skipping insert`,
              );
              return existingRecord;
            }

            // Store payment details
            return trx("forward_detail").insert({
              external_payment_id: externalPaymentId,
              msat_amount: msatAmount,
              fee_msat: fee,
              success: status === PaymentStatus.Completed,
              preimage: preimage,
            });
          });
      })
      .then(trx.commit)
      .then(() => {
        log.info(`Successfully logged forward for ${externalPaymentId}`);
        return true;
      })
      .catch((err) => {
        log.error(
          `Error updating forward table on handleCompletedForward: ${err}`,
        );
        return false;
      })
  );
};

// DEPRECATED: This function is replaced by atomic transaction processing
// in handleCompletedWithdrawal to prevent race conditions
async function checkWithdrawalStatus(transactionId: number) {
  // Add delay to prevent checking status before it is intially updated
  await new Promise((resolve) => setTimeout(resolve, 3000));

  return db
    .knex("transaction")
    .select("is_pending")
    .where({ id: transactionId })
    .then((data) => {
      return data[0].is_pending;
    })
    .catch((err) => {
      log.error(`Error checking withdrawal status: ${err}`);
      return false;
    });
}

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
  if (!userId) {
    log.error(`Error getting userId from transactionId: ${transactionId}`);
    return false;
  }

  const trx = await db.knex.transaction();
  try {
    // Atomically check if transaction is still pending and lock it
    const transaction = await trx("transaction")
      .select("is_pending", "success", "user_id")
      .where({ id: transactionId })
      .forUpdate()
      .first();

    if (!transaction) {
      log.error(`Transaction ${transactionId} not found`);
      await trx.rollback();
      return false;
    }

    // Idempotent check - if already processed, return success
    if (!transaction.is_pending) {
      log.info(
        `Transaction ${transactionId} already processed (is_pending: false), skipping update.`,
      );
      await trx.rollback();
      return true;
    }

    if (status === PaymentStatus.Completed) {
      // Update transaction table
      await trx("transaction")
        .update({
          success: true,
          is_pending: false,
          updated_at: db.knex.fn.now(),
          fee_msat: fee,
          preimage: preimage,
        })
        .where({ id: transactionId });

      // Decrement user balance and unlock user
      await trx("user")
        .decrement({
          msat_balance: msatAmount + fee,
        })
        .update({ updated_at: db.knex.fn.now(), is_locked: false })
        .where({ id: userId });

      await trx.commit();
      log.info(`Successfully logged withdrawal of ${msatAmount} for ${userId}`);
      return true;
    } else if (status === PaymentStatus.Error) {
      // Update transaction table for error case
      await trx("transaction")
        .update({
          success: false,
          is_pending: false,
          updated_at: db.knex.fn.now(),
        })
        .where({ id: transactionId });

      // Unlock user (no balance change for failed payment)
      await trx("user")
        .update({ updated_at: db.knex.fn.now(), is_locked: false })
        .where({ id: userId });

      await trx.commit();
      log.info(`Logged withdrawal with error for ${userId}`);
      return true;
    } else {
      // Unknown status - rollback and return success
      await trx.rollback();
      log.info(
        `Unknown payment status ${status} for transaction ${transactionId}`,
      );
      return true;
    }
  } catch (err) {
    await trx.rollback();
    log.error(
      `Error updating transaction table on handleCompletedWithdrawal: ${err}`,
    );
    return false;
  }
};

import log from "loglevel";
import db from "./db";
import { IncomingInvoiceTableMap, IncomingInvoiceType } from "./common";
import prisma from "../prisma/client";

export async function getUserIdFromTransactionId(
  transactionId: number
): Promise<string> {
  return db
    .knex("transaction")
    .select("user_id")
    .where("id", "=", transactionId)
    .first()
    .then((data) => {
      return data.user_id;
    })
    .catch((err) => {
      log.error(`Error finding user from transactionId ${err}`);
    });
}

export const wasTransactionAlreadyLogged = async (
  invoiceId: number,
  invoiceType: IncomingInvoiceType
): Promise<boolean> => {
  const tableName = IncomingInvoiceTableMap[invoiceType];
  return db
    .knex(tableName)
    .select("is_pending as isPending")
    .where("id", "=", invoiceId)
    .first()
    .then((data) => {
      return !data.isPending; // If transaction is not pending, it was already logged
    })
    .catch((err) => {
      log.error(
        `Error finding invoice id ${invoiceId} in ${tableName}: ${err}`
      );
      return false;
    });
};
export const handleCompletedPromoInvoice = async (
  invoiceId: number,
  msatAmount: number
) => {
  return prisma.promo
    .update({
      where: {
        id: invoiceId,
      },
      data: {
        isPending: false,
        isPaid: true,
        updatedAt: new Date(),
        // auto enable promo once paid
        // TODO - add a feature to enable/disable promos from UI
        // may want to start with a disabled promo
        isActive: true,
      },
    })
    .then(() => {
      log.info(
        `Successfully logged promo invoice of ${msatAmount} for ${invoiceId}`
      );
      return true;
    })
    .catch((err) => {
      log.error(
        `Error updating promo table on handleCompletedPromoInvoice: ${err}`
      );
      return false;
    });
};

export const handleCompletedDeposit = async (
  transactionId: number,
  msatAmount: number
) => {
  const userId = await getUserIdFromTransactionId(transactionId);
  const trx = await db.knex.transaction();
  // Update transaction table and user balance in one tx
  return trx("transaction")
    .update({
      success: true,
      is_pending: false,
    })
    .where({ id: transactionId })
    .then(() => {
      // Increment user balance and unlock user
      return trx("user")
        .increment({
          msat_balance: msatAmount,
        })
        .update({ updated_at: db.knex.fn.now(), is_locked: false })
        .where({ id: userId });
    })
    .then(trx.commit)
    .then(() => {
      log.info(`Successfully logged deposit of ${msatAmount} for ${userId}`);
      return true;
    })
    .catch((err) => {
      log.error(
        `Error updating transaction table on handleCompletedDeposit: ${err}`
      );
      return false;
    });
};

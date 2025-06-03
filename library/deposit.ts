import log from "./logger";
import db from "./db";
import { IncomingInvoiceTableMap, IncomingInvoiceType } from "./common";
import prisma from "../prisma/client";
import { generateValidationCode, sendTicketDm } from "./tickets";

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
  msatAmount: number,
  // decrement sender balance if internal payment
  isInternalPayment: boolean,
  senderUserId?: string
) => {
  return prisma
    .$transaction(async (prismaTransaction) => {
      // Update promo invoice status
      const updatedPromo = await prismaTransaction.promo.update({
        where: {
          id: invoiceId,
        },
        data: {
          isPending: false,
          isPaid: true,
          updatedAt: new Date(),
          // auto enable promo once paid
          isActive: true,
        },
      });

      // If it's an internal payment, decrement sender's balance
      if (isInternalPayment && senderUserId) {
        await prismaTransaction.user.update({
          where: {
            id: senderUserId,
          },
          data: {
            msatBalance: {
              decrement: msatAmount,
            },
            updatedAt: new Date(),
          },
        });
        log.info(
          `Decremented sender ${senderUserId} balance by ${msatAmount} msat for promo invoice`
        );
      }

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

export const handleCompletedTicketInvoice = async (
  invoiceId: number,
  msatAmount: number,
  // decrement sender balance if internal payment
  isInternalPayment: boolean,
  senderUserId?: string
) => {
  // Start a transaction using Prisma
  return await prisma
    .$transaction(async (prismaTransaction) => {
      // Find the ticket inside the transaction
      const ticket = await prismaTransaction.ticket.findFirst({
        where: {
          id: invoiceId,
        },
      });

      if (!ticket) {
        log.error(`Ticket not found for ID: ${invoiceId}`);
        return;
      }
      log.info(`Ticket found: ${ticket.id}`);

      // Find the ticketed event inside the transaction
      const ticketedEvent = await prismaTransaction.ticketed_event.findFirst({
        where: {
          id: ticket.ticketedEventId,
        },
      });

      if (!ticketedEvent) {
        log.error(`Ticketed event not found for ticket ID: ${ticket.id}`);
        return;
      }

      log.info(`Ticketed event found: ${ticketedEvent.id}`);
      log.info(`Ticketed event owner: ${ticketedEvent.user_id}`);
      const ticketSecret = generateValidationCode();

      // Update ticket record
      const updatedTicket = await prismaTransaction.ticket.update({
        where: {
          id: ticket.id,
        },
        data: {
          isPending: false,
          isPaid: true,
          updatedAt: new Date(),
          priceMsat: msatAmount,
          ticketSecret: ticketSecret,
        },
      });

      // Increment event owner's balance
      log.info(`Incrementing owner balance by ${msatAmount} msat`);
      await prismaTransaction.user.update({
        where: {
          id: ticketedEvent.user_id,
        },
        data: {
          msatBalance: {
            increment: msatAmount * updatedTicket.count,
          },
          updatedAt: new Date(),
        },
      });

      // If it's an internal payment, decrement sender's balance
      if (isInternalPayment && senderUserId) {
        await prismaTransaction.user.update({
          where: {
            id: senderUserId,
          },
          data: {
            msatBalance: {
              decrement: msatAmount,
            },
            updatedAt: new Date(),
          },
        });
        log.info(
          `Decremented sender ${senderUserId} balance by ${msatAmount} msat for ticket invoice`
        );
      }

      await sendTicketDm(ticketedEvent, updatedTicket);

      return true;
    })
    .catch((err) => {
      log.error(
        `Error updating ticket invoice on handleCompletedTicketInvoice: ${err}`
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

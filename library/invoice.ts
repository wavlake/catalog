import log from "loglevel";
import db from "./db";
import { handleCompletedDeposit, wasTransactionAlreadyLogged } from "./deposit";

export const updateInvoiceIfNeeded = async (
  internalId: string,
  status: string,
  amount: number
) => {
  // Check invoice type
  const invoiceType = internalId.split("-")[0];
  const invoiceId = parseInt(internalId.split("-")[1]);
  log.debug("Invoice type", invoiceType);

  const wasLogged = await wasTransactionAlreadyLogged(invoiceId, invoiceType);
  if (wasLogged) {
    log.debug(`Transaction ${invoiceId} was already logged, skipping.`);
    return true;
  }

  const isCompleted = status === "completed";
  if (!isCompleted) {
    log.debug("Invoice failed");
    await handleFailedOrExpiredInvoice(invoiceType, invoiceId);
    return {
      success: true,
      data: { status: "failed" },
      message: "The invoice has failed or expired.",
    };
  }

  if (invoiceType === "transaction") {
    log.debug(`Processing transaction invoice for id ${internalId}`);
    await handleCompletedDeposit(invoiceId, amount);
  }
  // TODO: handle external_receive invoices
  if (invoiceType === "external_receive") {
    log.debug(`Processing external_receive invoice for id ${internalId}`);
    // Process should account for plain invoices and zaps
  }
  return { success: true, data: { status: status } };
};

async function handleFailedOrExpiredInvoice(
  invoiceType: string,
  internalId: number
) {
  await db
    .knex(invoiceType)
    .update({
      is_pending: false,
      success: false,
      updated_at: db.knex.fn.now(),
    })
    .catch((err) => {
      log.error(
        `Error in handleFailedOrExpiredInvoice: ${invoiceType} invoice ${internalId}: ${err}`
      );
    });
}

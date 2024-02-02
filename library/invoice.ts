const log = require("loglevel");
log.setLevel("debug");
import db from "./db";
import { handleCompletedDeposit, wasTransactionAlreadyLogged } from "./deposit";
import { processSplits } from "./amp";

export const updateInvoiceIfNeeded = async (
  invoiceType: string,
  invoiceId: number,
  status: string,
  amount: number
) => {
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
    log.debug(`Processing transaction invoice for id ${invoiceId}`);
    await handleCompletedDeposit(invoiceId, amount);
  }
  // TODO: handle external_receive invoices
  if (invoiceType === "external_receive") {
    log.debug(`Processing external_receive invoice for id ${invoiceId}`);
    // Process should account for plain invoices and zaps
    await handleCompletedAmpInvoice(invoiceId, amount);
  }
  return { success: true, data: { status: status } };
};

async function getContentIdFromInvoiceId(invoiceId: number) {
  const invoice = await db
    .knex("external_receive")
    .select("track_id")
    .where("id", "=", invoiceId)
    .first()
    .catch((err) => {
      log.error(
        `Error getting content id from invoice id ${invoiceId}: ${err}`
      );
    });
  return invoice.track_id;
}

async function handleCompletedAmpInvoice(invoiceId: number, amount: number) {
  // 1. Zap or regular invoice?
  // 2. Process splits
  // 3. Update invoice status

  // TODO: Look up zap or party mode
  const isZap = false;
  const isPartyMode = false;

  // const paymentTypes = {
  //   6: "invoice",
  //   7: "zap",
  //   8: "party",
  // };

  const paymentType = isZap ? 7 : isPartyMode ? 8 : 6;
  const contentId = await getContentIdFromInvoiceId(invoiceId);
  log.debug(`Processing amp invoice for content id ${contentId}`);

  if (!contentId) {
    log.error(`No content id found for invoice id ${invoiceId}`);
    return;
  }

  const amp = await processSplits({
    contentId: contentId,
    msatAmount: amount,
    paymentType: paymentType,
    contentTime: null,
  });

  if (!amp) {
    log.error(`Error processing splits for content id ${contentId}`);
    return;
  }

  await db
    .knex("external_receive")
    .update({
      is_pending: false,
      updated_at: db.knex.fn.now(),
    })
    .where("id", "=", invoiceId)
    .catch((err) => {
      log.error(`Error updating external_receive invoice ${invoiceId}: ${err}`);
    });

  return true;
}

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

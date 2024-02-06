const log = require("loglevel");
log.setLevel("debug");
import db from "./db";
import { handleCompletedDeposit, wasTransactionAlreadyLogged } from "./deposit";
import { processSplits } from "./amp";
import { getZapPubkeyAndContent, publishZapReceipt } from "./zap";
import { ZBDChargeCallbackRequest } from "./zbd/requestInterfaces";
import { ChargeStatus } from "./zbd/constants";

enum PaymentType {
  Zap = 7,
  PartyMode = 8,
  Invoice = 6,
}

export const updateInvoiceIfNeeded = async (
  invoiceType: string,
  invoiceId: number,
  charge: ZBDChargeCallbackRequest
) => {
  const wasLogged = await wasTransactionAlreadyLogged(invoiceId, invoiceType);
  if (wasLogged) {
    log.debug(`Transaction ${invoiceId} was already logged, skipping.`);
    return { success: true, message: "Transaction was already logged" };
  }

  const status = charge.status;
  const msatAmount = parseInt(charge.amount);
  if (!Object.values(ChargeStatus).includes(status as ChargeStatus)) {
    log.error(`Invalid status: ${status}`);
    return { success: false, message: "Invalid invoice status" };
  }

  // Handle finalized invoices
  if (status != ChargeStatus.Pending) {
    log.debug(
      `Transaction ${invoiceId} is stale, updating status to ${status}`
    );

    if (status === ChargeStatus.Error || status === ChargeStatus.Expired) {
      log.debug("Invoice failed or expired");
      await handleFailedOrExpiredInvoice(invoiceType, invoiceId);
      return {
        success: true,
        data: { status: status },
        message: "The invoice has failed or expired.",
      };
    } else {
      if (invoiceType === "transaction") {
        log.debug(`Processing transaction invoice for id ${invoiceId}`);
        await handleCompletedDeposit(invoiceId, msatAmount);
      }
      if (invoiceType === "external_receive") {
        log.debug(`Processing external_receive invoice for id ${invoiceId}`);
        // Process should account for plain invoices and zaps
        await handleCompletedAmpInvoice(invoiceId, msatAmount);
      }
      return { success: true, data: { status: status } };
    }
  }
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
  // TODO: Look up zap or party mode
  const isZap = await checkIfAmpIsZap(invoiceId);
  const isPartyMode = false;

  const paymentType = isZap
    ? PaymentType.Zap
    : isPartyMode
    ? PaymentType.PartyMode
    : PaymentType.Invoice;

  let pubkey, content;
  if (isZap) {
    log.debug(`Processing zap details for invoice id ${invoiceId}`);
    const zapInfo = await getZapPubkeyAndContent(invoiceId);
    pubkey = zapInfo.pubkey;
    content = zapInfo.content;
  }
  const contentId = await getContentIdFromInvoiceId(invoiceId);
  log.debug(`Processing amp invoice for content id ${contentId}`);

  if (!contentId) {
    log.error(`No content id found for invoice id ${invoiceId}`);
    return;
  }

  log.debug(`paymentType: ${paymentType}`);
  const amp = await processSplits({
    contentId: contentId,
    msatAmount: amount,
    paymentType: paymentType,
    contentTime: null,
    userId: pubkey ? pubkey : null,
    comment: content ? content : null,
  });

  if (!amp) {
    log.error(`Error processing splits for content id ${contentId}`);
    return;
  }

  // Publish zap receipt if isZap
  if (isZap) {
    log.debug(`Publishing zap receipt for invoice id ${invoiceId}`);
    await publishZapReceipt(
      content,
      "paymentrequest", // TODO: get payment request
      "preimage", // TODO: use preimage
      Date.now().toString()
    );
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

// We use the `payment_hash` field for our internalId, which is unique in our system
async function checkIfAmpIsZap(invoiceId: number) {
  const zap = await db
    .knex("zap_request")
    .where("payment_hash", `external_receive-${invoiceId}`)
    .first()
    .then((data) => {
      return data ? true : false;
    })
    .catch((err) => {
      log.error(`Error checking if invoice is a zap: ${err}`);
    });
  return zap;
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

export const logZapRequest = async (
  invoiceId: number,
  eventId: string,
  event: string
) => {
  return db
    .knex("zap_request")
    .insert({
      payment_hash: `external_receive-${invoiceId}`,
      event_id: eventId,
      event: event,
    })
    .catch((err) => {
      throw new Error(`Error inserting zap request: ${err}`);
    });
};

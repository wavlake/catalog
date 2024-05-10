const log = require("loglevel");
log.setLevel("debug");
import db from "./db";
import { handleCompletedDeposit, wasTransactionAlreadyLogged } from "./deposit";
import { processSplits } from "./amp";
import {
  getZapPubkeyAndContent,
  publishPartyReceipt,
  publishZapReceipt,
} from "./zap";
import { ZBDChargeCallbackRequest } from "./zbd/requestInterfaces";
import { ChargeStatus } from "./zbd/constants";
import { PaymentType } from "./common";

export const updateInvoiceIfNeeded = async (
  invoiceType: string,
  invoiceId: number,
  charge: ZBDChargeCallbackRequest
): Promise<{
  success: boolean;
  data?: { status: ChargeStatus };
  message?: string;
}> => {
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
      await handleFailedOrExpiredInvoice(invoiceType, invoiceId, status);
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
  // Look up invoice type
  const paymentTypeCode = await getInvoicePaymentTypeCode(invoiceId);

  let zapRequest, pubkey, content, timestamp;
  if (paymentTypeCode === PaymentType.Zap) {
    log.debug(`Processing zap details for invoice id ${invoiceId}`);
    const zapInfo = await getZapPubkeyAndContent(invoiceId);
    zapRequest = zapInfo.zapRequest;
    pubkey = zapInfo.pubkey;
    content = zapInfo.content;
    timestamp = zapInfo.timestamp;
  }
  const contentId = await getContentIdFromInvoiceId(invoiceId);
  log.debug(`Processing amp invoice for content id ${contentId}`);

  if (!contentId) {
    log.error(`No content id found for invoice id ${invoiceId}`);
    return;
  }

  const amp = await processSplits({
    contentId: contentId,
    msatAmount: amount,
    paymentType: paymentTypeCode,
    contentTime: timestamp ?? null,
    userId: pubkey ? pubkey : null,
    comment: content ? content : null,
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

  // Publish zap receipt if isZap
  if (paymentTypeCode === PaymentType.Zap) {
    log.debug(`Publishing zap receipt for invoice id ${invoiceId}`);
    await publishZapReceipt(
      zapRequest,
      "paymentrequest", // TODO: get payment request
      "preimage" // TODO: use preimage
    ).catch((e) => {
      log.error(
        `Error publishing zap receipt for invoice id ${invoiceId}: ${e}`
      );
      return;
    });
  }

  if (paymentTypeCode === PaymentType.PartyMode) {
    log.debug(`Publishing party receipt for invoice id ${invoiceId}`);
    await publishPartyReceipt(contentId).catch((e) => {
      log.error(
        `Error publishing party receipt for invoice id ${invoiceId}: ${e}`
      );
      return;
    });
  }

  return true;
}

async function getInvoicePaymentTypeCode(invoiceId: number) {
  const pendingInvoice = await db
    .knex("external_receive")
    .select("payment_type_code")
    .where("id", "=", invoiceId)
    .first()
    .catch((err) => {
      log.error(
        `Error getting payment type for invoice id ${invoiceId}: ${err}`
      );
    });
  return pendingInvoice.payment_type_code;
}

async function handleFailedOrExpiredInvoice(
  invoiceType: string,
  internalId: number,
  status: string
) {
  await db
    .knex(invoiceType)
    .update({
      is_pending: false,
      error_message: status,
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

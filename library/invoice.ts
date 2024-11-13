const log = require("loglevel");
log.setLevel("debug");
import db from "./db";
import {
  getUserIdFromTransactionId,
  handleCompletedDeposit,
  handleCompletedPromoInvoice,
  wasTransactionAlreadyLogged,
} from "./deposit";
import { processSplits } from "./amp";
import {
  getZapPubkeyAndContent,
  publishPartyReceipt,
  publishZapReceipt,
} from "./zap";
import { ZBDChargeCallbackRequest } from "./zbd/requestInterfaces";
import { ChargeStatus } from "./zbd/constants";
import {
  PaymentType,
  IncomingInvoiceType,
  IncomingInvoiceTableMap,
} from "./common";
import { updateNpubMetadata } from "./nostr/nostr";

export const updateInvoiceIfNeeded = async (
  invoiceType: IncomingInvoiceType,
  invoiceId: number,
  charge: ZBDChargeCallbackRequest
): Promise<{
  success: boolean;
  data?: { status: ChargeStatus };
  message?: string;
}> => {
  const wasLogged = await wasTransactionAlreadyLogged(invoiceId, invoiceType);
  if (wasLogged) {
    log.debug(`${invoiceType} id:${invoiceId} was already logged, skipping.`);
    return { success: true, message: `${invoiceType} was already logged` };
  }

  const status = charge.status;
  const msatAmount = parseInt(charge.amount);
  const paymentRequest = charge.invoice.request;
  const preimage = charge.invoice.preimage;
  const externalId = charge.id;
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
      switch (invoiceType) {
        case IncomingInvoiceType.Transaction:
          log.debug(`Processing transaction invoice for id ${invoiceId}`);
          await handleCompletedDeposit(invoiceId, msatAmount);
          break;
        case IncomingInvoiceType.ExternalReceive:
          log.debug(`Processing external_receive invoice for id ${invoiceId}`);
          // Process should account for plain invoices and zaps
          await handleCompletedAmpInvoice(
            invoiceId,
            msatAmount,
            paymentRequest,
            preimage,
            externalId
          );
          break;
        case IncomingInvoiceType.LNURL:
          log.debug(`Processing lnurl invoice for id ${invoiceId}`);
          await handleCompletedDeposit(invoiceId, msatAmount);
          break;
        case IncomingInvoiceType.LNURL_Zap:
          log.debug(`Processing lnurl zap invoice for id ${invoiceId}`);
          await handleCompletedLNURLZapInvoice(
            invoiceId,
            msatAmount,
            paymentRequest,
            preimage,
            externalId
          );
          break;
        case IncomingInvoiceType.Promo:
          log.debug(`Processing promo invoice for id ${invoiceId}`);
          await handleCompletedPromoInvoice(invoiceId, msatAmount);
          break;
        default:
          log.error(`Invalid invoiceType: ${invoiceType}`);
          return { success: false, message: "Invalid invoice type" };
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

async function handleCompletedAmpInvoice(
  invoiceId: number,
  amount: number,
  paymentRequest: string,
  preimage: string,
  externalId: string
) {
  // Look up invoice type
  const paymentTypeCode = await getInvoicePaymentTypeCode(invoiceId);
  const referrerAppId = await getReferrerAppIdForInvoice(invoiceId);

  let zapRequest, pubkey, content, timestamp;

  ///////// TEMPORARY - REMOVE AFTER 240728 /////////
  let isConferenceZap = false;
  /////////

  if (paymentTypeCode === PaymentType.Zap) {
    log.debug(`Processing zap details for invoice id ${invoiceId}`);
    const zapInfo = await getZapPubkeyAndContent(invoiceId);
    zapRequest = zapInfo.zapRequest;
    pubkey = zapInfo.pubkey;
    content = zapInfo.content;
    timestamp = zapInfo.timestamp;

    ///////// TEMPORARY - REMOVE AFTER 240728 /////////
    try {
      const hashtag = zapRequest.tags.find((x) => x[0] === "t");
      const btc24Tag = hashtag && hashtag[1] === "btc24jukebox";
      if (btc24Tag) {
        isConferenceZap = true;
      }
    } catch (e) {
      log.error(`Error checking for conference zap: ${e}`);
    }
    /////////
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
    isNostr: paymentTypeCode === PaymentType.Zap,
    externalTxId: externalId,
    referrerAppId: referrerAppId,
    ///////// TEMPORARY - REMOVE AFTER 240728 /////////
    isConferenceZap: isConferenceZap,
    /////////
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
      preimage: preimage,
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
      paymentRequest,
      preimage,
      externalId
    ).catch((e) => {
      log.error(
        `Error publishing zap receipt for invoice id ${invoiceId}: ${e}`
      );
      return;
    });

    log.debug(`Publishing party receipt for invoice id ${invoiceId}`);
    await publishPartyReceipt(contentId).catch((e) => {
      log.error(
        `Error publishing party receipt for invoice id ${invoiceId}: ${e}`
      );
      return;
    });
    // async update the npub metadata in the db
    updateNpubMetadata(pubkey)
      .then(({ success }) => {
        log.debug(
          `${
            success ? "Updated" : "Failed to update"
          } nostr metadata for: ${pubkey}`
        );
      })
      .catch((err) => {
        log.debug("error updating npub metadata: ", err);
      });
  }

  return true;
}

async function handleCompletedLNURLZapInvoice(
  transactionId: number,
  msatAmount: number,
  paymentRequest: string,
  preimage: string,
  externalId: string
) {
  const userId = await getUserIdFromTransactionId(transactionId);
  const trx = await db.knex.transaction();
  // Update transaction table and user balance in one tx
  const tx = await trx("transaction")
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
      log.debug(`Successfully logged deposit of ${msatAmount} for ${userId}`);
      return true;
    })
    .catch((err) => {
      log.error(
        `Error updating transaction table on handleCompletedDeposit: ${err}`
      );
      return false;
    });

  const { zapRequest, pubkey, content, timestamp } =
    await getZapPubkeyAndContent(transactionId, IncomingInvoiceType.LNURL_Zap);

  log.debug(`Publishing zap receipt for invoice id ${transactionId}`);
  await publishZapReceipt(
    zapRequest,
    paymentRequest,
    preimage,
    externalId
  ).catch((e) => {
    log.error(
      `Error publishing zap receipt for invoice id ${transactionId}: ${e}`
    );
    return;
  });

  // async update the npub metadata in the db
  updateNpubMetadata(pubkey)
    .then(({ success }) => {
      log.debug(
        `${
          success ? "Updated" : "Failed to update"
        } nostr metadata for: ${pubkey}`
      );
    })
    .catch((err) => {
      log.debug("error updating npub metadata: ", err);
    });
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
  invoiceType: IncomingInvoiceType,
  internalId: number,
  status: string
) {
  const table = IncomingInvoiceTableMap[invoiceType];
  if (!table) {
    log.error(`Invalid invoice type: ${invoiceType}`);
    return;
  }

  const update =
    table === "promo"
      ? {
          is_pending: false,
          updated_at: db.knex.fn.now(),
        }
      : {
          is_pending: false,
          updated_at: db.knex.fn.now(),
          ...(table === "external_receive"
            ? { error_message: status }
            : { failure_reason: status }),
        };
  await db
    .knex(table)
    .update(update)
    .where("id", "=", internalId)
    .catch((err) => {
      log.error(
        `Error in handleFailedOrExpiredInvoice: ${invoiceType} invoice ${internalId}: ${err}`
      );
    });
}

async function getReferrerAppIdForInvoice(invoiceId: number) {
  const invoice = await db
    .knex("external_receive")
    .select("referrer_app_id")
    .where("id", "=", invoiceId)
    .first()
    .catch((err) => {
      log.error(
        `Error getting referrer id from invoice id ${invoiceId}: ${err}`
      );
    });
  return invoice.referrer_app_id;
}

export const logZapRequest = async (
  invoiceId: number,
  eventId: string,
  event: string,
  invoiceType = IncomingInvoiceType.ExternalReceive
) => {
  return db
    .knex("zap_request")
    .insert({
      payment_hash: `${IncomingInvoiceTableMap[invoiceType]}-${invoiceId}`,
      event_id: eventId,
      event: event,
    })
    .catch((err) => {
      throw new Error(`Error inserting zap request: ${err}`);
    });
};

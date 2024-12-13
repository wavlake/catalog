import prisma from "@prismalocal/client";
const log = require("loglevel");
log.setLevel(process.env.LOGLEVEL);
const nlInvoice = require("@node-lightning/invoice");
import { processSplits } from "@library/amp";
const { getZapPubkeyAndContent, publishZapReceipt } = require("@library/zap");
import { updateWallet, walletHasRemainingBudget } from "./wallet";
import { initiatePayment, runPaymentChecks } from "@library/payments";
const { broadcastEventResponse } = require("./event");
const { webcrypto } = require("node:crypto");
globalThis.crypto = webcrypto;
import { FEE_BUFFER } from "@library/constants";
import { randomUUID } from "crypto";
import { IncomingInvoiceType } from "@library/common";
import { Event } from "nostr-tools";

type InvoiceResult = {
  type: "incoming" | "outgoing";
  invoice?: string;
  description?: string;
  description_hash?: string;
  preimage?: string; // optional for lookup_invoice
  payment_hash: string;
  amount: number;
  fees_paid: number;
  created_at: string;
  expires_at?: string;
  settled_at?: string;
  metadata: Record<string, unknown>;
};
interface WalletUser {
  userId: string;
  msatBudget: number;
  maxMsatPaymentAmount: number;
  msatBalance: string;
}

export const payInvoice = async (
  event: Event,
  content,
  walletUser: WalletUser
) => {
  log.debug(`Processing pay_invoice event ${event.id}`);
  const { params } = JSON.parse(content);
  const { invoice } = params;
  const { userId, msatBudget, maxMsatPaymentAmount, msatBalance } = walletUser;
  let decodedInvoice;
  try {
    decodedInvoice = nlInvoice.decode(invoice);
  } catch (err) {
    log.error(`Error decoding invoice ${err}`);
    return;
  }

  const { paymentHash, valueMsat, network } = decodedInvoice;
  log.debug(`Decoded invoice ${invoice}`);

  // Check if payment amount exceeds max payment amount
  if (parseInt(valueMsat) > maxMsatPaymentAmount) {
    log.debug(`Transaction for ${userId} exceeds max payment amount.`);
    sendErrorResponse(
      event,
      "pay_invoice",
      "QUOTA_EXCEEDED",
      "Transaction exceeds max payment amount"
    );
    return;
  }

  // Check if user has sufficient balance and passes other checks
  const passedChecks = await runPaymentChecks(
    userId,
    invoice,
    parseInt(valueMsat),
    FEE_BUFFER * parseInt(valueMsat)
  );

  if (!passedChecks.success) {
    log.debug(`Transaction for ${userId} failed payment checks.`);
    sendErrorResponse(
      event,
      "pay_invoice",
      passedChecks.error?.message ===
        "Insufficient funds to cover payment and transaction fees"
        ? "INSUFFICIENT_BALANCE"
        : "OTHER",
      passedChecks.error?.message || "Payment failed"
    );
    return;
  }

  // Check if spending is within NWC wallet's budget
  const hasRemainingBudget = await walletHasRemainingBudget(
    event.pubkey,
    msatBudget,
    valueMsat
  );
  log.debug(`Remaining budget for ${userId} is ${hasRemainingBudget}`);
  if (!hasRemainingBudget) {
    log.debug(`Transaction for ${userId} exceeds budget.`);
    sendErrorResponse(
      event,
      "pay_invoice",
      "QUOTA_EXCEEDED",
      "Transaction exceeds budget"
    );
    return;
  }

  // Check if Wavlake created the invoice
  const paymentHashStr = Buffer.from(paymentHash).toString("hex");
  const wavlakeInvoiceInfo = await getWavlakeInvoice(paymentHashStr);

  log.debug(`Wavlake invoice info: ${JSON.stringify(wavlakeInvoiceInfo)}`);
  // If Wavlake invoice, treat as an internal amp payment
  if (wavlakeInvoiceInfo?.isWavlake) {
    if (!wavlakeInvoiceInfo.isSettled) {
      const zapRequestData = await getZapPubkeyAndContent(
        wavlakeInvoiceInfo.id,
        IncomingInvoiceType.ExternalReceive
      );

      if (!zapRequestData) {
        log.debug(`No zap request found for invoice ${paymentHashStr}`);
        return;
      }

      const { pubkey, content, zapRequest } = zapRequestData;
      log.debug(`Processing Wavlake invoice...`);
      await createInternalPayment(
        zapRequest,
        wavlakeInvoiceInfo.id,
        invoice,
        wavlakeInvoiceInfo.contentId,
        pubkey,
        content,
        userId,
        valueMsat,
        msatBalance,
        event
      );
      return;
    } else {
      log.debug(`Wavlake invoice is closed, skipping.`);
      return;
    }
  }

  // If not Wavlake invoice, treat as an external payment
  log.debug(`Processing external invoice...`);
  await createExternalPayment(event, invoice, userId, valueMsat, msatBalance);
  return;
};

export const getBalance = async (event: Event, walletUser: WalletUser) => {
  log.debug(`Processing get_balance event ${event.id}`);
  const { msatBalance, maxMsatPaymentAmount, msatBudget } = walletUser;
  broadcastEventResponse(
    event.pubkey,
    event.id,
    JSON.stringify({
      result_type: "get_balance",
      result: {
        balance: parseInt(msatBalance),
        max_payment: maxMsatPaymentAmount,
        budget: msatBudget,
      },
    })
  );
};

// External payment
const createExternalPayment = async (
  event,
  invoice,
  userId,
  valueMsat,
  msatBalance
) => {
  const externalPaymentResult = await initiatePayment(
    null,
    userId,
    invoice,
    parseInt(valueMsat),
    FEE_BUFFER
  );

  if (externalPaymentResult.success) {
    log.debug(`External payment successful`);

    const preimageString = externalPaymentResult.data.preimage; // Returned as string already
    const msatSpentIncludingFee =
      parseInt(valueMsat) + parseInt(externalPaymentResult.data.fee);

    await updateWallet(event.pubkey, msatSpentIncludingFee);

    const newBalance = parseInt(msatBalance) - msatSpentIncludingFee;
    // Broadcast response
    broadcastEventResponse(
      event.pubkey,
      event.id,
      JSON.stringify({
        result_type: "pay_invoice",
        result: {
          preimage: preimageString,
          balance: newBalance,
        },
      })
    );
  } else {
    log.debug(`External payment failed`);
    sendErrorResponse(event, "pay_invoice", "PAYMENT_FAILED", "Payment failed");
  }
  return;
};

interface ZapRequestEvent {
  tags: [string, string][];
}

// Internal payment
const createInternalPayment = async (
  zapRequest: ZapRequestEvent,
  invoiceId: number,
  paymentRequest: string,
  contentId: string,
  pubkey: string,
  content: string,
  userId: string,
  valueMsat,
  msatBalance,
  event
) => {
  const txId = randomUUID();
  const timestamp = zapRequest.tags.find((tag) => tag[0] === "timestamp")[1];
  const payment = await processSplits({
    paymentType: 10,
    contentTime: parseInt(timestamp),
    contentId: contentId,
    userId: userId,
    npub: pubkey,
    msatAmount: valueMsat,
    comment: content,
    isNostr: true,
    externalTxId: txId,
  });
  if (payment) {
    log.debug(`Paid internal invoice with id ${invoiceId}, cancelling...`);

    await prisma.externalReceive.update({
      where: { id: invoiceId },
      data: {
        isPending: false,
        preimage: "nwc",
      },
    });

    // NOTE: We use "nwc" as the preimage value to share in zap receipts
    // because we do not have access to the actual preimage and it is not
    // a true, verifiable proof of payment
    await publishZapReceipt(zapRequest, paymentRequest, "nwc", txId);
    // Broadcast response

    const newBalance = parseInt(msatBalance) - parseInt(valueMsat);
    broadcastEventResponse(
      event.pubkey,
      event.id,
      JSON.stringify({
        result_type: "pay_invoice",
        result: {
          preimage: "nwc",
          balance: newBalance,
        },
      })
    );
    await updateWallet(event.pubkey, valueMsat);
    return;
  } else {
    log.debug(`Internal payment failed`);
    return;
  }
};

const getWavlakeInvoice = async (paymentHash: string) => {
  log.debug(`Checking if invoice is Wavlake invoice`);

  const receiveRecord = await prisma.externalReceive.findMany({
    where: { paymentHash: paymentHash },
  });

  if (receiveRecord.length === 0) {
    log.debug(`Invoice not found in database`);
    return null;
  }

  const isSettled =
    !receiveRecord[0].isPending && receiveRecord[0].preimage !== null;
  return {
    id: receiveRecord[0].id,
    contentId: receiveRecord[0].trackId,
    isWavlake: true,
    isSettled: isSettled,
    preimage: receiveRecord[0].preimage,
  };
};

export const makeInvoice = async (event: Event, walletUser: WalletUser) => {
  // TODO: Implement makeInvoice
};

export const lookupInvoice = async (
  event: Event,
  params:
    | {
        invoice: string;
        payment_hash?: string;
      }
    | {
        payment_hash: string;
        invoice?: string;
      },
  walletUser: WalletUser
) => {
  const { invoice, payment_hash } = params;

  if (!invoice && !payment_hash) {
    return sendErrorResponse(
      event,
      "lookup_invoice",
      "OTHER",
      "Missing both invoice and payment_hash"
    );
  }

  const invoiceData = await prisma.transaction.findFirst({
    where: invoice
      ? { paymentRequest: invoice }
      : { paymentHash: payment_hash },
  });

  if (!invoiceData) {
    return sendErrorResponse(
      event,
      "lookup_invoice",
      "NOT_FOUND",
      "Invoice not found"
    );
  }

  if (invoiceData.userId !== walletUser.userId) {
    return sendErrorResponse(
      event,
      "lookup_invoice",
      "UNAUTHORIZED",
      "User not authorized to view invoice"
    );
  }

  const result: InvoiceResult = {
    type: invoiceData.withdraw ? "outgoing" : "incoming",
    invoice: invoiceData.paymentRequest,
    preimage: invoiceData.success ? invoiceData.preimage : undefined,
    payment_hash: invoiceData.paymentHash,
    amount: parseInt(invoiceData.msatAmount.toString()),
    fees_paid: invoiceData.feeMsat,
    created_at: invoiceData.createdAt.toISOString(),
    expires_at: new Date(
      invoiceData.createdAt.getTime() + 60 * 60 * 1000
    ).toISOString(),
    settled_at: invoiceData.success
      ? invoiceData.updatedAt.toISOString()
      : undefined,
    metadata: {
      is_lnurl: invoiceData.isLnurl,
      comment: invoiceData.lnurlComment,
      success: invoiceData.success,
      failure_reason: invoiceData.failureReason,
    },
  };

  sendResponse(event, { result_type: "lookup_invoice", result });
};

const sendErrorResponse = (
  event: Event,
  method: string,
  code: string,
  message: string
) => {
  sendResponse(event, {
    result_type: method,
    error: { code, message },
  });
};

const sendResponse = (event: Event, response: any) => {
  broadcastEventResponse(event.pubkey, event.id, JSON.stringify(response));
};

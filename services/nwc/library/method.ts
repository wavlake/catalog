import prisma from "@prismalocal/client";
const nlInvoice = require("@node-lightning/invoice");
import { processSplits } from "@library/amp";
import { getZapPubkeyAndContent, publishZapReceipt } from "@library/zap";
import { updateWallet, walletHasRemainingBudget } from "./wallet";
import { initiatePayment, runPaymentChecks } from "@library/payments";
const { broadcastEventResponse } = require("./event");
const { webcrypto } = require("node:crypto");
if (!globalThis.crypto) {
  // Only assign if it doesn't exist
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    writable: true,
    configurable: true,
  });
}
import { FEE_BUFFER } from "@library/constants";
import { randomUUID } from "crypto";
import { IncomingInvoiceType } from "@library/common";
import { Event } from "nostr-tools";
import {
  handleCompletedPromoInvoice,
  handleCompletedTicketInvoice,
} from "@library/deposit";

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
  console.log(`Processing pay_invoice event ${event.id}`);
  const { params } = JSON.parse(content);
  const { invoice } = params;
  const { userId, msatBudget, maxMsatPaymentAmount, msatBalance } = walletUser;
  let decodedInvoice;
  try {
    decodedInvoice = nlInvoice.decode(invoice);
  } catch (err) {
    console.error(`Error decoding invoice ${err}`);
    return;
  }

  const { valueMsat } = decodedInvoice;
  const valueMsatInt = parseInt(valueMsat);
  console.log(`Decoded invoice: ${invoice}`);
  console.log(`Value: ${valueMsat}`);

  // Check if payment amount exceeds max payment amount
  if (valueMsatInt > maxMsatPaymentAmount) {
    console.log(`Transaction for ${userId} exceeds max payment amount.`);
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
    valueMsatInt,
    FEE_BUFFER * valueMsatInt
  );

  if (!passedChecks.success) {
    console.log(`Transaction for ${userId} failed payment checks.`);
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
    valueMsatInt
  );
  console.log(`Remaining budget for ${userId} is ${hasRemainingBudget}`);
  if (!hasRemainingBudget) {
    console.log(`Transaction for ${userId} exceeds budget.`);
    sendErrorResponse(
      event,
      "pay_invoice",
      "QUOTA_EXCEEDED",
      "Transaction exceeds budget"
    );
    return;
  }

  // Check if Wavlake created the invoice
  const wavlakeInvoiceInfo = await getWavlakeInvoice(invoice);

  console.log(`Wavlake invoice info: ${JSON.stringify(wavlakeInvoiceInfo)}`);
  // If Wavlake invoice, treat as an internal amp payment
  if (wavlakeInvoiceInfo?.isWavlake) {
    if (!wavlakeInvoiceInfo.isSettled) {
      const { zapRequest } = (await getZapPubkeyAndContent(
        wavlakeInvoiceInfo.id,
        IncomingInvoiceType.ExternalReceive
      )) || { zapRequest: null };

      console.log(`Processing Wavlake invoice...`);
      await createInternalPayment({
        zapRequest,
        invoiceId: wavlakeInvoiceInfo.id,
        paymentRequest: invoice,
        contentId: wavlakeInvoiceInfo.contentId,
        userId,
        valueMsatInt,
        msatBalance,
        event,
        type: wavlakeInvoiceInfo.type,
      });
      return;
    } else {
      console.log(`Wavlake invoice is closed, skipping.`);
      return;
    }
  }

  // If not Wavlake invoice, treat as an external payment
  console.log(`Processing external invoice...`);
  await createExternalPayment(
    event,
    invoice,
    userId,
    valueMsatInt,
    msatBalance
  );
  return;
};

export const getBalance = async (event: Event, walletUser: WalletUser) => {
  console.log(`Processing get_balance event ${event.id}`);
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
  valueMsatInt,
  msatBalance
) => {
  const externalPaymentResult = await initiatePayment(
    null,
    userId,
    invoice,
    valueMsatInt,
    FEE_BUFFER
  );

  if (externalPaymentResult.success) {
    console.log(`External payment successful`);

    const preimageString = externalPaymentResult.data.preimage; // Returned as string already
    const msatSpentIncludingFee =
      valueMsatInt + parseInt(externalPaymentResult.data.fee);

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
    console.log(`External payment failed`);
    sendErrorResponse(event, "pay_invoice", "PAYMENT_FAILED", "Payment failed");
  }
  return;
};

// Internal payment
const createInternalPayment = async ({
  zapRequest,
  invoiceId,
  paymentRequest,
  contentId,
  userId,
  valueMsatInt,
  msatBalance,
  event,
  type,
}: {
  zapRequest?: Event;
  invoiceId: number;
  paymentRequest: string;
  contentId: string;
  userId: string;
  valueMsatInt: number;
  msatBalance;
  event;
  type: IncomingInvoiceType;
}) => {
  const newBalance = parseInt(msatBalance) - valueMsatInt;
  const txId = randomUUID();
  let payment;

  if (!zapRequest) {
    console.log(
      `No zap request found for invoiceId: ${invoiceId} type: ${type}`
    );
  } else {
    console.log("Found zap request", zapRequest);
    const [timestampTag, timestamp] =
      zapRequest.tags.find((tag) => tag[0] === "timestamp") ?? [];

    payment = !zapRequest
      ? null
      : await processSplits({
          paymentType: 10,
          contentTime: parseInt(timestamp),
          contentId: contentId,
          userId: userId,
          npub: zapRequest.pubkey,
          msatAmount: valueMsatInt,
          comment: zapRequest.content,
          isNostr: true,
          externalTxId: txId,
        });
  }

  if (payment) {
    console.log(`Paid internal invoice with id ${invoiceId}, cancelling...`);

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

    await broadcastPaymentResponse(event, newBalance);
    await updateWallet(event.pubkey, valueMsatInt);
    return;
  }

  if (type === IncomingInvoiceType.Promo) {
    console.log(`Attempting to settle promo invoice`);
    const success = await handleCompletedPromoInvoice(
      invoiceId,
      valueMsatInt,
      true,
      userId
    );
    if (success) {
      await broadcastPaymentResponse(event, newBalance);
      await updateWallet(event.pubkey, valueMsatInt);
      return;
    }
  }
  if (type === IncomingInvoiceType.Ticket) {
    console.log(`Attempting to settle ticket invoice`);
    const success = await handleCompletedTicketInvoice(
      invoiceId,
      valueMsatInt,
      true,
      userId
    );
    if (success) {
      await broadcastPaymentResponse(event, newBalance);
      await updateWallet(event.pubkey, valueMsatInt);
      return;
    }
  }

  // Fallback error handling

  console.log(`Internal payment failed`);
  broadcastEventResponse(
    event.pubkey,
    event.id,
    JSON.stringify({
      result_type: "pay_invoice",
      error: {
        message: "Internal payment failed",
        code: "INTERNAL",
      },
    })
  );
};

// Helper function to broadcast payment response
const broadcastPaymentResponse = async (event: any, newBalance: number) => {
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
};
const getWavlakeInvoice = async (invoice) => {
  console.log(`Checking if Wavlake invoice`);
  let decodedInvoice;
  try {
    decodedInvoice = nlInvoice.decode(invoice);
  } catch (err) {
    console.error(`Error decoding invoice ${err}`);
    return;
  }

  const { paymentHash } = decodedInvoice;
  const paymentHashStr = Buffer.from(paymentHash).toString("hex");
  console.log(`Payment hash: ${paymentHashStr}`);
  const receiveRecord = await prisma.externalReceive.findFirst({
    where: { paymentHash: paymentHashStr },
  });

  if (receiveRecord) {
    console.log(`Found external receive record, id: ${receiveRecord.id}`);

    return {
      id: receiveRecord.id,
      contentId: receiveRecord.trackId,
      isWavlake: true,
      isSettled: !receiveRecord.isPending && receiveRecord.preimage !== null,
      preimage: receiveRecord.preimage,
      type: IncomingInvoiceType.ExternalReceive,
    };
  }

  const promoRecord = await prisma.promo.findFirst({
    where: { paymentRequest: invoice },
  });

  if (promoRecord) {
    console.log(`Found promo record, id: ${promoRecord.id}`);
    return {
      id: promoRecord.id,
      contentId: null,
      isWavlake: true,
      isSettled: !promoRecord.isPending && promoRecord.paymentRequest !== null,
      preimage: "nwc",
      type: IncomingInvoiceType.Promo,
    };
  }

  const ticketRecord = await prisma.ticket.findFirst({
    where: { paymentRequest: invoice },
  });

  if (ticketRecord) {
    console.log(`Found ticket record, id: ${ticketRecord.id}`);
    return {
      id: ticketRecord.id,
      contentId: null,
      isWavlake: true,
      isSettled:
        !ticketRecord.isPending && ticketRecord.paymentRequest !== null,
      preimage: "nwc",
      type: IncomingInvoiceType.Ticket,
    };
  }

  console.log(
    `Invoice not found in database for payment request ${paymentHash}`
  );
  return null;
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

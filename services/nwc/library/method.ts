import prisma from "@prismalocal/client";
const log = require("loglevel");
log.setLevel(process.env.LOGLEVEL);
const nlInvoice = require("@node-lightning/invoice");
const amp = require("@library/amp");
const db = require("@library/db");
const { getZapPubkeyAndContent, publishZapReceipt } = require("@library/zap");
const { updateWallet, walletHasRemainingBudget } = require("./wallet");
const { initiatePayment, runPaymentChecks } = require("@library/payments");
const { broadcastEventResponse } = require("./event");
const { webcrypto } = require("node:crypto");
globalThis.crypto = webcrypto;

// TODO: Remove hard coding fee buffer
const FEE_BUFFER = 10000;

const payInvoice = async (event, relay, content, walletUser) => {
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
  if (parseInt(valueMsat) > parseInt(maxMsatPaymentAmount)) {
    log.debug(`Transaction for ${userId} exceeds max payment amount.`);
    broadcastEventResponse(
      event.pubkey,
      event.id,
      JSON.stringify({
        result_type: "pay_invoice",
        error: {
          code: "QUOTA_EXCEEDED",
          message: "Transaction exceeds max payment amount",
        },
      })
    );
    return;
  }

  // Check if user has sufficient balance and passes other checks
  const passedChecks = await runPaymentChecks(
    null,
    userId,
    invoice,
    parseInt(valueMsat),
    FEE_BUFFER
  );

  if (!passedChecks.success) {
    log.debug(`Transaction for ${userId} failed payment checks.`);
    broadcastEventResponse(
      event.pubkey,
      event.id,
      JSON.stringify({
        result_type: "pay_invoice",
        error: {
          code:
            passedChecks.error == "Insufficient funds"
              ? "INSUFFICIENT_BALANCE"
              : "OTHER",
          message: passedChecks.error,
        },
      })
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
    broadcastEventResponse(
      event.pubkey,
      event.id,
      JSON.stringify({
        result_type: "pay_invoice",
        error: {
          code: "QUOTA_EXCEEDED",
          message: "Transaction exceeds budget",
        },
      })
    );
    return;
  }

  // Check if Wavlake created the invoice
  const paymentHashStr = Buffer.from(paymentHash).toString("hex");
  const wavlakeInvoiceInfo = await getWavlakeInvoice(paymentHashStr);

  // If Wavlake invoice, treat as an internal amp payment
  if (wavlakeInvoiceInfo?.isWavlake) {
    if (!wavlakeInvoiceInfo.isSettled) {
      const zapRequestData = await getZapPubkeyAndContent(
        `external_receive-${wavlakeInvoiceInfo.id}`
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
        wavlakeInvoiceInfo.preimage,
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
  await createExternalPayment(
    event,
    relay,
    invoice,
    userId,
    valueMsat,
    msatBalance
  );
  return;
};

const getBalance = async (event, relay, walletUser) => {
  log.debug(`Processing get_balance event ${event.id}`);
  const { msatBalance } = walletUser;
  broadcastEventResponse(
    event.pubkey,
    event.id,
    JSON.stringify({
      result_type: "get_balance",
      result: {
        balance: parseInt(msatBalance),
      },
    })
  );
};

// External payment
const createExternalPayment = async (
  event,
  relay,
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
      parseInt(valueMsat) + parseInt(externalPaymentResult.data.feeMsat);

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

    broadcastEventResponse(
      event.pubkey,
      event.id,
      JSON.stringify({
        result_type: "pay_invoice",
        error: {
          code: "PAYMENT_FAILED",
          message: "Payment failed",
        },
      })
    );
  }
  return;
};

// Internal payment
const createInternalPayment = async (
  zapRequest: string,
  invoiceId: number,
  paymentRequest: string,
  contentId: string,
  pubkey: string,
  content: string,
  preimage: string,
  userId: string,
  valueMsat,
  msatBalance,
  event
) => {
  // const rHashStr = Buffer.from(paymentHash).toString("hex");
  // const zapEvent = await getZapRequestEvent(rHashStr);
  // const preimageString = Buffer.from(preimage).toString("hex");

  // if (!zapEvent) {
  //   log.debug(`No zap request event found for ${rHashStr}`);
  //   return;
  // }
  // // log.debug(zapEvent);

  // let parsedZapEvent;
  // try {
  //   parsedZapEvent = JSON.parse(zapEvent);
  // } catch (err) {
  //   log.error(`Error parsing zap request event ${err}`);
  //   return;
  // }

  // const comment = parsedZapEvent?.content;
  const trx = await db.knex.transaction();
  const payment = await amp.buildAmpTx({
    res: null,
    trx: trx,
    type: 10,
    contentId: contentId,
    userId: userId,
    npub: pubkey,
    msatAmount: valueMsat,
    comment: content,
    isNostr: true,
    isNwc: true,
  });
  if (payment) {
    log.debug(`Paid internal invoice with id ${invoiceId}, cancelling...`);

    // DEPRECATED: Unable to cancel invoices in ZBD
    // Cancel invoice
    // invoices.cancelInvoice({ payment_hash: paymentHash }, function (err, res) {
    //   if (err) {
    //     log.error(err);
    //   }
    // });

    await publishZapReceipt(zapRequest, paymentRequest, preimage);
    // Broadcast response

    const newBalance = parseInt(msatBalance) - parseInt(valueMsat);
    broadcastEventResponse(
      event.pubkey,
      event.id,
      JSON.stringify({
        result_type: "pay_invoice",
        result: {
          preimage: preimage,
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
  // return new Promise((resolve, reject) => {
  //   try {
  //     lightning.lookupInvoice(lnRequest, function (err, response) {
  //       log.trace(response);
  //       if (err) {
  //         resolve(null);
  //         return;
  //       }
  //       const { memo, state, r_preimage } = response;
  //       if (memo.includes("Wavlake")) {
  //         log.debug(`Invoice is a Wavlake invoice`);
  //         resolve({
  //           isWavlake: true,
  //           memo: memo,
  //           state: state,
  //           preimage: r_preimage,
  //         });
  //       } else {
  //         log.debug(`Invoice is not Wavlake invoice`);
  //         resolve({ isWavlake: false });
  //       }
  //     });
  //   } catch (err) {
  //     log.error(err);
  //     resolve({ isWavlake: false });
  //     return;
  //   }
};

module.exports = {
  payInvoice,
  getBalance,
};

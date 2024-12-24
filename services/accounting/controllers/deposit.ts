import log from "../../../library/winston";
import asyncHandler from "express-async-handler";
import prisma from "@prismalocal/client";
import { getUserBalance } from "@library/userHelper";
import { createCharge } from "@library/zbd/zbdClient";
import {
  MAX_INVOICE_AMOUNT,
  DEFAULT_EXPIRATION_SECONDS,
} from "@library/constants";
import { validateNostrZapRequest } from "@library/zap";
import { logZapRequest } from "@library/invoice";
import { IncomingInvoiceType } from "@library/common";

const createDeposit = asyncHandler(async (req, res: any, next) => {
  const userId = req["uid"];
  const request = {
    msatAmount: req.body.msatAmount,
  };

  if (
    isNaN(request.msatAmount) ||
    request.msatAmount < 1000 ||
    request.msatAmount > MAX_INVOICE_AMOUNT
  ) {
    return res.status(400).send({
      success: false,
      error: `Amount must be a number between 1000 and ${MAX_INVOICE_AMOUNT} (msats)`,
    });
  }

  const userBalance = await getUserBalance(userId);
  // Create a blank invoice in the database to reference
  const invoice = await prisma.transaction.create({
    data: {
      userId: userId,
      isPending: true,
      withdraw: false,
      msatAmount: request.msatAmount,
      preTxBalance: parseInt(userBalance), // This will have to be updated when the payment is made
      paymentRequest: "",
      isLnurl: false,
    },
  });

  log.info(`Created placeholder invoice: ${invoice.id}`);

  const invoiceRequest = {
    description: `Wavlake deposit`,
    amount: request.msatAmount.toString(),
    expiresIn: DEFAULT_EXPIRATION_SECONDS,
    internalId: `${IncomingInvoiceType.Transaction}-${invoice.id.toString()}`,
  };

  log.info(
    `Sending create invoice request for deposit: ${JSON.stringify(
      invoiceRequest
    )}`
  );

  // call ZBD api to create an invoice
  const invoiceResponse = await createCharge(invoiceRequest);

  if (!invoiceResponse.success) {
    log.error(`Error creating invoice: ${invoiceResponse.message}`);
    res.status(500).send({
      success: false,
      error: "There has been an error generating an invoice",
    });
    return;
  }

  log.info(
    `Received create invoice response: ${JSON.stringify(invoiceResponse)}`
  );

  // Update the invoice in the database
  const updatedInvoice = await prisma.transaction
    .update({
      where: { id: invoice.id },
      data: {
        paymentRequest: invoiceResponse.data.invoice.request,
        externalId: invoiceResponse.data.id,
        updatedAt: new Date(),
      },
    })
    .catch((e) => {
      log.error(`Error updating invoice: ${e}`);
      return null;
    });

  if (!updatedInvoice) {
    log.error(`Error updating invoice: ${invoiceResponse.message}`);
    res.status(500).send({
      success: false,
      error: "There has been an error generating an invoice",
    });
    return;
  }

  log.info(`Updated invoice: ${JSON.stringify(updatedInvoice)}`);

  res.json({
    success: true,
    data: { ...invoiceResponse.data.invoice, invoiceId: updatedInvoice.id },
  });
});

const createDepositLNURL = asyncHandler(async (req, res: any, next) => {
  const userId = req.body.userId as string;
  const amount = req.body.amount as string;
  const nostr = req.body.nostr as string;
  const metadata = req.body.metadata as string;
  const lnurl = req.body.lnurl as string;
  const comment = req.body.comment as string;
  const amountInt = parseInt(amount);

  if (isNaN(amountInt) || amountInt < 1000 || amountInt > MAX_INVOICE_AMOUNT) {
    log.info(
      `Invalid amount, must be between 1000 and ${MAX_INVOICE_AMOUNT} sats, recieved ${amount}`
    );
    res.status(400).send({
      success: false,
      error: `Amount must be a number between 1000 and ${MAX_INVOICE_AMOUNT} (msats)`,
    });
    return;
  }

  let zapRequestEvent;
  if (nostr) {
    const validationResult = validateNostrZapRequest({ nostr, amount });
    if (!validationResult.isValid) {
      log.info(`Lnurl zap request is invalid: ${validationResult.error}`);
      res.status(400).send({ success: false, error: validationResult.error });
      return;
    }
    zapRequestEvent = validationResult.zapRequestEvent;
  }

  const userBalance = await getUserBalance(userId);
  // Create a blank invoice in the database to reference
  const invoice = await prisma.transaction.create({
    data: {
      userId: userId,
      isPending: true,
      withdraw: false,
      msatAmount: amountInt,
      preTxBalance: parseInt(userBalance), // This will have to be updated when the payment is made
      paymentRequest: "",
      isLnurl: true,
      // comment may be an empty string
      lnurlComment: comment || undefined,
    },
  });

  log.info(`Created placeholder lnurl invoice: ${invoice.id}`);

  if (zapRequestEvent) {
    // Create zap request record
    await logZapRequest(
      invoice.id,
      zapRequestEvent.id,
      JSON.stringify(zapRequestEvent),
      IncomingInvoiceType.LNURL_Zap
    );
  }

  const invoiceRequest = {
    description: `Wavlake lnurl${zapRequestEvent ? "-zap" : ""} deposit`,
    amount: amountInt.toString(),
    expiresIn: DEFAULT_EXPIRATION_SECONDS,
    internalId: `${
      zapRequestEvent
        ? IncomingInvoiceType.LNURL_Zap
        : IncomingInvoiceType.LNURL
    }-${invoice.id.toString()}`,
  };

  log.info(
    `Sending create invoice request for lnurl deposit: ${JSON.stringify(
      invoiceRequest
    )}`
  );

  // call ZBD api to create an invoice
  const invoiceResponse = await createCharge(invoiceRequest);

  if (!invoiceResponse.success) {
    log.error(`Error creating lnurl invoice: ${invoiceResponse.message}`);
    res.status(500).send({
      success: false,
      error: "There has been an error generating an invoice",
    });
    return;
  }

  log.info(
    `Received create lnurl invoice response: ${JSON.stringify(invoiceResponse)}`
  );

  // Update the invoice in the database
  const updatedInvoice = await prisma.transaction
    .update({
      where: { id: invoice.id },
      data: {
        paymentRequest: invoiceResponse.data.invoice.request,
        externalId: invoiceResponse.data.id,
        updatedAt: new Date(),
      },
    })
    .catch((e) => {
      log.error(`Error updating lnurl invoice: ${e}`);
      return null;
    });

  if (!updatedInvoice) {
    log.error(`Error updating invoice: ${invoiceResponse.message}`);
    res.status(500).send({
      success: false,
      error: "There has been an error generating an invoice",
    });
    return;
  }

  log.info(`Updated lnurl invoice: ${JSON.stringify(updatedInvoice)}`);

  res.json({
    success: true,
    data: { ...invoiceResponse.data.invoice, invoiceId: updatedInvoice.id },
  });
});

const getDeposit = asyncHandler(async (req, res: any, next) => {
  const userId = req["uid"];
  const { id } = req.params;

  const invoiceId = parseInt(id);
  if (!id || isNaN(invoiceId)) {
    return res.status(400).send({
      success: false,
      error: "Invoice ID is required",
    });
  }

  const invoice = await prisma.transaction.findUnique({
    where: { id: invoiceId },
  });

  if (!invoice || invoice.userId !== userId) {
    return res.status(404).send({
      success: false,
      error: "Invoice not found",
    });
  }

  res.json({ success: true, data: { invoice } });
  return;
});

export default { createDeposit, getDeposit, createDepositLNURL };

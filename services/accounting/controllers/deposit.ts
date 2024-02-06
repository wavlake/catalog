const log = require("loglevel");
import db from "@library/db";
import asyncHandler from "express-async-handler";
import prisma from "@prismalocal/client";
import { getUserBalance } from "@library/userHelper";
import { createCharge } from "@library/zbd/zbdClient";
import {
  MAX_INVOICE_AMOUNT,
  DEFAULT_EXPIRATION_SECONDS,
} from "@library/constants";
import { updateInvoiceIfNeeded } from "@library/invoice";
import { getCharge } from "@library/zbd";
import { ChargeStatus } from "@library/zbd/constants";

const getDeposit = asyncHandler(async (req, res, next) => {
  const userId = req["uid"];
  const { transactionId } = req.params;

  // validate the id param
  if (!transactionId) {
    res.status(400).send("Must include transactionId");
    return;
  }

  const intId = parseInt(transactionId);
  if (isNaN(intId) || intId <= 0) {
    res.status(400).send("Invalid transactionId, must be a positive integer");
    return;
  }

  const deposit = await db
    .knex("transaction")
    .select("*")
    .where("id", "=", intId)
    .where("user_id", "=", userId)
    .first()
    .catch((e) => {
      log.error(`Error finding deposit: ${e}`);
      return null;
    });

  if (!deposit) {
    res.status(404).send("Deposit not found");
    return;
  }

  if (deposit.is_pending) {
    const update = await getCharge(deposit.external_id);
    log.debug(update);
    const currentStatus = update.data.status;
    const msatAmount = update.data.amount;
    if (currentStatus != ChargeStatus.Pending) {
      log.debug(
        `Transaction ${intId} is stale, updating status to ${currentStatus}`
      );
      await updateInvoiceIfNeeded(
        "transaction",
        intId,
        currentStatus,
        parseInt(msatAmount)
      );
    }
  }

  res.json({ success: true, data: deposit });
});

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
    return res
      .status(400)
      .send(
        `Amount must be a number between 1000 and ${MAX_INVOICE_AMOUNT} (msats)`
      );
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
    },
  });

  log.debug(`Created placeholder invoice: ${invoice.id}`);

  const invoiceRequest = {
    description: `Wavlake deposit`,
    amount: request.msatAmount.toString(),
    expiresIn: DEFAULT_EXPIRATION_SECONDS,
    internalId: `transaction-${invoice.id.toString()}`,
  };

  log.debug(
    `Sending create invoice request for deposit: ${JSON.stringify(
      invoiceRequest
    )}`
  );

  // call ZBD api to create an invoice
  const invoiceResponse = await createCharge(invoiceRequest);

  if (!invoiceResponse.success) {
    log.error(`Error creating invoice: ${invoiceResponse.message}`);
    res.status(500).send("There has been an error generating an invoice");
    return;
  }

  log.debug(
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
    res.status(500).send("There has been an error generating an invoice");
    return;
  }

  log.debug(`Updated invoice: ${JSON.stringify(updatedInvoice)}`);

  res.json({
    success: true,
    data: { ...invoiceResponse.data.invoice, invoiceId: updatedInvoice.id },
  });
});

export default { getDeposit, createDeposit };

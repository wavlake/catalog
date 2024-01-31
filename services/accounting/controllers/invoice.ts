const log = require("loglevel");
import asyncHandler from "express-async-handler";
import prisma from "@prismalocal/client";
import { getContentFromId } from "@library/content";
import { createCharge } from "@library/zbd/zbdClient";

const DEFAULT_EXPIRATION_SECONDS = 3600;
const MAX_INVOICE_AMOUNT = 100000 * 1000; // 100k sats

const getInvoice = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  // validate the id param
  if (!id) {
    res.status(400).send("Must include an invoice ID");
    return;
  }

  const intId = parseInt(id);
  if (isNaN(intId) || intId <= 0) {
    res.status(400).send("Invalid invoice ID, must be a positive integer");
    return;
  }

  const invoice = await prisma.externalReceive.findUnique({
    where: { id: intId },
  });

  if (!invoice) {
    res.status(404).send("Invoice not found");
    return;
  }

  res.json(invoice);
});

const updateInvoice = asyncHandler(async (req, res, next) => {
  // TODO - determine what the ZBD payload will look like
  const { id, preimage } = req.body;

  // validate the id param
  if (!id) {
    res.status(400).send("Must include an invoice ID");
    return;
  }

  const intId = parseInt(id);
  if (isNaN(intId) || intId <= 0) {
    res.status(400).send("Invalid invoice ID, must be a positive integer");
    return;
  }

  // update the invoice status
  const updatedInvoice = await prisma.externalReceive.update({
    where: { id: intId },
    data: {
      // TODO - determine what fields need to be updated
      preimage,
    },
  });

  if (!updatedInvoice) {
    res.status(500).send(`Error updating invoice ID: ${id}`);
    return;
  }
  res.json(200);
});

const createInvoice = asyncHandler(async (req, res: any, next) => {
  const request = {
    trackId: req.body.trackId,
    msatAmount: req.body.msatAmount,
    type: req.body.type ? req.body.type : "boost",
    metadata: req.body.metadata,
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

  const isValidContentId = await getContentFromId(request.trackId);

  if (!isValidContentId) {
    return res.status(400).send("Invalid content id");
  }

  // Create a blank invoice in the database
  const invoice = await prisma.externalReceive.create({
    data: {
      trackId: request.trackId,
    },
  });

  log.debug(`Created placeholder invoice: ${invoice.id}`);

  const invoiceRequest = {
    description: isValidContentId.title,
    amount: request.msatAmount.toString(),
    expiresIn: DEFAULT_EXPIRATION_SECONDS,
    internalId: `external_receive-${invoice.id.toString()}`,
  };

  log.debug(
    `Sending create invoice request: ${JSON.stringify(invoiceRequest)}`
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
  const updatedInvoice = await prisma.externalReceive
    .update({
      where: { id: invoice.id },
      data: {
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

export default { getInvoice, updateInvoice, createInvoice };

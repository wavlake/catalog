const log = require("loglevel");
import asyncHandler from "express-async-handler";
import prisma from "@prismalocal/client";
import { getContentFromId } from "@library/content";
import { createCharge } from "@library/zbd/zbdClient";

const DEFAULT_EXPIRATION_SECONDS = 3600;

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
  // TODO - call ZBD api to create an invoice
  // save the invoice data to the database
  // return the invoice data to the client
  const request = {
    trackId: req.body.trackId,
    amount: req.body.amount * 1000, // Convert to msats
    type: req.body.type ? req.body.type : "boost",
    metadata: req.body.metadata ? req.body.metadata : null,
  };

  if (request.amount === 0) {
    return res.status(400).send("Amount must be greater than 0");
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

  const createInvoiceRequest = {
    description: isValidContentId.title,
    amount: request.amount.toString(),
    expiresIn: DEFAULT_EXPIRATION_SECONDS,
    internalId: `external_receive-${invoice.id.toString()}`,
  };

  log.debug(`Sending create invoice request: ${createInvoiceRequest}`);

  // TODO - call ZBD api to create an invoice
  const invoiceResponse = await createCharge(createInvoiceRequest);

  log.debug(`Received create invoice response: ${invoiceResponse}`);

  // TODO - save the invoice data to the database
  const updatedInvoice = await prisma.externalReceive.update({
    where: { id: invoice.id },
    data: {
      externalId: invoiceResponse.data.id,
      updatedAt: new Date(),
    },
  });

  log.debug(`Updated invoice: ${updatedInvoice}`);

  res.json({ success: true, data: updatedInvoice });
  // return createExternalAmpInvoice(
  //   isValidContentId.title,
  //   request.trackId,
  //   request.amount,
  //   request.type,
  //   request.metadata
  // )
  //   .then((response) => res.status(200).send(response))
  //   .catch((e) => {
  //     log.error(`Error creating external amp invoice: ${e}`);
  //     res.status(500).send("Error creating invoice");
  //   });
});

export default { getInvoice, updateInvoice, createInvoice };

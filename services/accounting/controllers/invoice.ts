const log = require("loglevel");
import asyncHandler from "express-async-handler";
import prisma from "@prismalocal/client";

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

  // query the transaction table using the provided id
  const invoice = await prisma.external_receive.findUnique({
    where: { id: intId },
  });

  if (!invoice) {
    res.status(404).send("Invoice not found");
    return;
  }

  res.json(invoice);
});

const updateInvoice = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  // TODO - determine what the body will look like
  const bodyZBD = req.body;

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
  const updatedInvoice = await prisma.external_receive.update({
    where: { id: intId },
    data: { status },
  });

  if (!updatedInvoice) {
    res.status(500).send(`Error updating invoice ID: ${id}`);
    return;
  }
  res.json(200);
});

const createInvoice = asyncHandler(async (req, res, next) => {
  // TODO - call ZBD api to create an invoice
  // save the invoice data to the database
  // return the invoice data to the client

  res.json(200);
});

export default { getInvoice, updateInvoice, createInvoice };

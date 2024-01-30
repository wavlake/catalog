const log = require("loglevel");
import asyncHandler from "express-async-handler";
import prisma from "@prismalocal/client";

const processIncomingKeysend = asyncHandler(async (req, res, next) => {
  // TODO - process an incoming keysend payement
  res.status(200);
});

const updateInvoice = asyncHandler(async (req, res, next) => {
  // TODO - update an invoice
  // the invoice status is expected to change from pending to success or fail
  res.status(200);
});

export default { processIncomingKeysend, updateInvoice };

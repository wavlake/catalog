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
  const invoice = await prisma.transaction.findUnique({
    where: { id: intId },
  });

  if (!invoice) {
    res.status(404).send("Invoice not found");
    return;
  }

  res.json(invoice);
});

export default { getInvoice };

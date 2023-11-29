const log = require("loglevel");
import asyncHandler from "express-async-handler";
import { sendPayment } from "../library/zbdClient";
import { formatError } from "../library/errors";
const NLInvoice = require("@node-lightning/invoice");

const createPayment = asyncHandler(async (req, res, next) => {
  const { description, invoice } = req.body;
  const userId = req["uid"];

  // Validate invoice
  const { valueMsat } = NLInvoice.decode(invoice);

  if (!valueMsat || valueMsat <= 0) {
    const error = formatError(400, "Invalid invoice");
    next(error);
  }
  log.info(`Sending payment for ${userId} via payment request: ${invoice}`);

  // Construct payload
  const payload = {
    description: description,
    amount: valueMsat,
    invoice: invoice,
    internalId: "123",
    callbackUrl: "https://0e7c-24-12-64-25.ngrok.io/payments/callback/zbd",
  };

  // Make Payment
  const data = await sendPayment(payload);

  if (!data.success) {
    const error = formatError(500, data.message);
    next(error);
  } else {
    // Response can come back as status: completed
    res.json({ data: data });
  }
});

const zbdCallback = asyncHandler(async (req, res, next) => {
  const { data } = req.body;

  log.info(`Received callback`);
  console.log(data);
});

export default { createPayment, zbdCallback };

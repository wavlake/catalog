const log = require("loglevel");
import asyncHandler from "express-async-handler";
import { formatError } from "../library/errors";
const { initiatePayment, runPaymentChecks } = require("../library/payments");
const NLInvoice = require("@node-lightning/invoice");

const createPayment = asyncHandler(async (req, res, next) => {
  const { description, invoice, msatMaxFee } = req.body;
  const userId = req["uid"];

  // Validate invoice
  const { valueMsat } = NLInvoice.decode(invoice);

  if (!valueMsat || valueMsat <= 0) {
    const error = formatError(400, "Invalid invoice");
    next(error);
  }

  // Run payment checks
  const paymentChecks = await runPaymentChecks(
    res,
    userId,
    invoice,
    parseInt(valueMsat),
    parseInt(msatMaxFee)
  );

  if (!paymentChecks.success) {
    log.info(`Check for ${userId} payment request failed, skipping.`);
    return;
  }

  await initiatePayment(
    res,
    next,
    userId,
    invoice,
    parseInt(valueMsat),
    parseInt(msatMaxFee)
  );
});

const zbdCallback = asyncHandler(async (req, res, next) => {
  const { data } = req.body;

  // TODO: Handle updates received from callbacks
  log.info(`Received callback`);
  console.log(data);
});

export default { createPayment, zbdCallback };

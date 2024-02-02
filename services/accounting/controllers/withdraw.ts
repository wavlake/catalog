const log = require("loglevel");
import asyncHandler from "express-async-handler";
import { initiatePayment, runPaymentChecks } from "@library/payments";
const NLInvoice = require("@node-lightning/invoice");
import { getCharge } from "@library/zbd";

const createWithdraw = asyncHandler(async (req, res, next) => {
  const { description, invoice, msatMaxFee } = req.body;
  const userId = req["uid"];

  // Validate invoice
  const { valueMsat } = NLInvoice.decode(invoice);

  if (!valueMsat || valueMsat <= 0) {
    res.status(400).send("Invalid invoice");
    return;
  }

  // Run payment checks
  const paymentChecks = await runPaymentChecks(
    userId,
    invoice,
    parseInt(valueMsat),
    parseInt(msatMaxFee)
  ).catch((e) => {
    log.error(`Error running payment checks: ${e}`);
    res.status(500).send("Error running user checks");
    return;
  });

  if (!paymentChecks.success) {
    log.info(`Check for ${userId} payment request failed, skipping.`);
    res
      .status(400)
      .send(paymentChecks.error.message || "Payment request failed");
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

const getWithdraw = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const data = await getCharge(id);
  res.json(data);
});

const updateWithdraw = asyncHandler(async (req, res, next) => {
  const { data } = req.body;

  // TODO: Handle updates received from callbacks
  log.info(`Received callback`);
  log.debug(`ZBD callback data: ${JSON.stringify(data)}`);
});

export default { createWithdraw, getWithdraw, updateWithdraw };

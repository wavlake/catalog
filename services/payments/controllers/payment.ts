const log = require("loglevel");
import asyncHandler from "express-async-handler";
import { formatError } from "@library/errors";
import { initiatePayment, runPaymentChecks } from "@library/payments";
const NLInvoice = require("@node-lightning/invoice");
const {
  isValidExternalKeysendRequest,
  processKeysends,
} = require("@library/keysend");
import { getCharge } from "@library/zbdClient";

const createKeysend = asyncHandler(async (req, res: any, next) => {
  log.debug(`TODO: Fix`);
  return;
  // Request should include the following:
  // - array of keysends: [{msatAmount: 100, pubkey: 'abc123', customKey: customValue, }, ...]
  // - message (optional)
  // - podcast info (podcast, guid, feedID, episode, episode title)
  // - ts
  // - value_msat_total
  const body = req.body;
  const { msatTotal } = body;
  const userId = req["uid"];
  log.debug(`Processing external keysend request for user ${userId}`);

  // Process:
  // Validate request

  const isValidRequest = await isValidExternalKeysendRequest(body);
  if (!isValidRequest) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  // Run payment checks
  const paymentChecks = await runPaymentChecks(
    userId,
    null,
    parseInt(msatTotal),
    0
  );

  if (!paymentChecks.success) {
    log.info(`Check for ${userId} payment request failed, skipping.`);
    res
      .status(400)
      .send(paymentChecks.error.message || "Payment request failed");
    return;
  }

  // 3. Process payments
  const keysendResults = await processKeysends(userId, body);

  res.status(200).json({ success: true, data: { keysends: keysendResults } });
});

const createPayment = asyncHandler(async (req, res, next) => {
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

const getPayment = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const data = await getCharge(id);
  res.json(data);
});

const zbdCallback = asyncHandler(async (req, res, next) => {
  const { data } = req.body;

  // TODO: Handle updates received from callbacks
  log.info(`Received callback`);
  console.log(data);
});

export default { createKeysend, createPayment, getPayment, zbdCallback };

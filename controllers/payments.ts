const log = require("loglevel");
import asyncHandler from "express-async-handler";
import { formatError } from "../library/errors";
import { initiatePayment, runPaymentChecks } from "../library/payments";
const NLInvoice = require("@node-lightning/invoice");
const {
  isValidExternalKeysendRequest,
  processKeysends,
} = require("../library/keysend");

const createKeysend = asyncHandler(async (req, res: any, next) => {
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
    return res.status(500).json({ error: "Invalid request" });
  }
  // Run payment checks
  const paymentChecks = await runPaymentChecks(
    res,
    userId,
    null,
    parseInt(msatTotal),
    0
  );

  if (!paymentChecks.success) {
    log.info(`Check for ${userId} payment request failed, skipping.`);
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

export default { createKeysend, createPayment, zbdCallback };

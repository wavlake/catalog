const log = require("loglevel");
import asyncHandler from "express-async-handler";
import { initiatePayment, runPaymentChecks } from "@library/payments";
const NLInvoice = require("@node-lightning/invoice");
import { FEE_BUFFER } from "@library/constants";

const createWithdraw = asyncHandler(async (req, res, next) => {
  const { description, invoice, msatMaxFee } = req.body;
  const userId = req["uid"];

  // Validate invoice
  const { valueMsat } = NLInvoice.decode(invoice);

  if (!valueMsat || valueMsat <= 0) {
    res.status(400).send({
      success: false,
      error: "Invalid invoice",
    });
    return;
  }

  // Run payment checks
  const paymentChecks = await runPaymentChecks(
    userId,
    invoice,
    parseInt(valueMsat),
    FEE_BUFFER * parseInt(valueMsat)
  ).catch((e) => {
    log.error(`Error running payment checks: ${e}`);
    res.status(500).send({
      success: false,
      error: "Error running user checks",
    });
    return;
  });

  if (!paymentChecks.success) {
    log.info(`Check for ${userId} payment request failed, skipping.`);
    res.status(400).send({
      success: false,
      error: paymentChecks.error.message || "Payment request failed",
    });
    return;
  }

  await initiatePayment(
    res,
    userId,
    invoice,
    parseInt(valueMsat),
    parseInt(msatMaxFee)
  );
});

export default { createWithdraw };

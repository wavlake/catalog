const log = require("loglevel");
import asyncHandler from "express-async-handler";
import { zbd } from "@zbd/node";

// Create ZBD instance
const ZBD = new zbd(process.env.ZBD_API_KEY);

const createPayment = asyncHandler(async (req, res, next) => {
  const { invoice } = req.body;
  const userId = req["uid"];

  log.info(`Withdrawing for ${userId} via payment request: ${invoice}`);

  // Construct payload
  const payload = {
    description: "Lightning fast!",
    amount: "13000",
    invoice: invoice,
    internalId: "123",
    callbackUrl: "https://6f79-24-12-64-25.ngrok.io/payments/callback/zbd",
  };

  // Make Payment
  const data = await ZBD.sendPayment(payload);

  res.json({ data: data });
});

const zbdCallback = asyncHandler(async (req, res, next) => {
  const { data } = req.body;

  log.info(`Received callback`);
  console.log(data);
});

export default { createPayment, zbdCallback };

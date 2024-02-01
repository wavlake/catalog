const log = require("loglevel");
const { checkUserHasSufficientSats } = require("@library/userHelper");
const { validate } = require("uuid");
const { processSplits } = require("@library/amp");
import db from "@library/db";
import asyncHandler from "express-async-handler";

const createSend = asyncHandler(async (req, res: any, next) => {
  const userId = req["uid"];
  const request = {
    contentId: req.body.contentId,
    msatAmount: req.body.msatAmount,
    comment: req.body.comment,
    contentTime: req.body.contentTime ? req.body.contentTime : null,
  };

  if (isNaN(request.msatAmount || request.msatAmount < 1000)) {
    return res.status(400).send("Amount should be a positive number");
  }

  if (!request.contentId || !validate(request.contentId)) {
    res.status(400).send("Request does not contain a valid content id");
    return;
  }

  log.debug(`Checking if user ${userId} has sufficient sats`);
  const userHasSufficientSats = await checkUserHasSufficientSats(
    userId,
    request.msatAmount
  );

  if (!userHasSufficientSats) {
    return res.status(400).send("Insufficient balance");
  }

  log.debug(`Creating amp transaction for user ${userId}`);
  const trx = await db.knex.transaction();

  const amp = await processSplits({
    trx: trx,
    contentId: request.contentId,
    userId: userId,
    paymentType: request.comment ? 2 : 1,
    msatAmount: request.msatAmount,
    comment: request.comment,
    contentTime: request.contentTime,
  });

  if (!amp) {
    log.error(`Error processing splits for user ${userId}`);
    return res.status(500).send("Error processing splits");
  }

  return res.status(200).json({ success: true, data: { amp } });
});

export default { createSend };

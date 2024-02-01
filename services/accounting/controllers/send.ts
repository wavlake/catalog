const log = require("loglevel");
import asyncHandler from "express-async-handler";
import prisma from "@prismalocal/client";
import {
  checkUserHasSufficientSats,
  isValidExternalKeysendRequest,
} from "@library/keysends/validations";

const feeLimitMsat = 20000; // Hard-coding for external keysends for now

const sendKeysend = asyncHandler(async (req, res, next) => {
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
  try {
    const isValidRequest = await isValidExternalKeysendRequest(body);
    if (!isValidRequest) {
      return res.status(500).json({ error: "Invalid request" });
    }
    // 2. Check user balance
    const userHasSufficientSats = await checkUserHasSufficientSats(
      userId,
      parseInt(msatTotal) + feeLimitMsat // Add estimated fee limit
    );

    if (!userHasSufficientSats) {
      return res.status(403).json({ error: "Insufficient balance" });
    }

    // TODO call - ZBD

    // ---------

    //TODO handle success/failure response
    const processKeysendsResult = await processKeysends(userId, body);

    // 4. Return success/fail response
    res.json({ success: true, data: { keysends: processKeysendsResult } });
  } catch (e) {
    log.error(`Error processing external keysends: ${e}`);
    res.status(500).json({ success: false, error: "External keysend failed" });
  }
  res.json(200);
});

export default { sendKeysend };

import asyncHandler from "express-async-handler";
import {
  isValidExternalKeysendRequest,
  ExternalKeysendRequest,
  ExternalKeysendResponse,
  ExternalKeysendResult,
  constructCustomRecords,
  constructKeysendMetadata,
  recordInProgressKeysend,
} from "@library/keysends";
import core from "express-serve-static-core";
import log from "../../../library/logger";
import { sendKeysend as zbdSendKeysend } from "@library/zbd/zbdClient";
import { validate } from "uuid";
import { processSplits } from "@library/amp";
import { checkUserHasSufficientSats } from "@library/userHelper";
import { TransactionStatus } from "@library/zbd/constants";
import { randomUUID } from "crypto";
import { handleInternalKeysends } from "@library/keysends/internalKeysend";

const sendKeysend = asyncHandler<
  core.ParamsDictionary,
  ExternalKeysendResponse,
  ExternalKeysendRequest
>(async (req, res, next) => {
  // Request should include the following:
  // - array of keysends: [{msatAmount: 100, pubkey: 'abc123', customKey: customValue, }, ...]
  // - message (optional)
  // - podcast info (podcast, guid, feedID, episode, episode title)
  // - ts
  // - value_msat_total
  const body = req.body;
  const {
    msatTotal,
    keysends,
    message,
    podcast,
    guid,
    feedId,
    episode,
    episodeGuid,
    ts,
  } = body;
  const userId = req["uid"];
  log.info(`Processing external keysend request for user ${userId}`);
  try {
    const isValidRequest = isValidExternalKeysendRequest(body);
    if (!isValidRequest) {
      res.status(500).json({ success: false, error: "Invalid request" });
      return;
    }

    // estimate a 15% total fee
    const BUFFER_AMOUNT = 0.15;
    const feeEstimate = BUFFER_AMOUNT * msatTotal;

    // Check user balance
    const userHasSufficientSats = await checkUserHasSufficientSats(
      userId,
      msatTotal + feeEstimate // Add estimated fee
    );

    if (!userHasSufficientSats) {
      res.status(403).json({ success: false, error: "Insufficient balance" });
      return;
    }

    // First we handle the internal keysends and filter them out of the list
    const externalKeysends = await handleInternalKeysends(
      message,
      keysends,
      userId
    );

    // We generate a unique interal tx id for each outgoing keysend to send to ZBD,
    // which they return in the callback
    const keysendsWithIds = externalKeysends.map((keysend) => {
      return { ...keysend, internalTxId: randomUUID() };
    });
    // Send keysends using service provider (ZBD)
    const processedResponses: ExternalKeysendResult[] = await Promise.all(
      keysendsWithIds.map(async (keysend) => {
        const keysendMetadata = await constructKeysendMetadata(userId, body);

        const customRecords = constructCustomRecords(keysend, keysendMetadata);
        const res = await zbdSendKeysend({
          amount: keysend.msatAmount.toString(),
          pubkey: keysend.pubkey,
          metadata: { internalTxId: keysend.internalTxId },
          tlvRecords: customRecords,
        });
        if (!res) {
          log.error("Error sending keysend to ZBD. No response.");
          return {
            success: false,
            msatAmount: keysend.msatAmount,
            pubkey: keysend.pubkey,
            feeMsat: 0,
          };
        }

        if (res.success) {
          // response from zbd
          const { data } = res;
          // request sent to zbd
          const { msatAmount, pubkey, name, internalTxId } = keysend;
          recordInProgressKeysend({
            keysendData: data,
            pubkey,
            internalTxId,
            metadata: {
              message,
              podcast,
              guid,
              feedId,
              episode,
              episodeGuid,
              ts,
              userId,
              name,
            },
          });
          return {
            // this is not really true if the payment is in flight, but we report it as true to the client
            success: true,
            message:
              res.data.transaction.status === TransactionStatus.Processing
                ? "Keysend payment is in flight"
                : undefined,
            msatAmount: msatAmount,
            pubkey: pubkey,
            feeMsat: parseInt(data.transaction.fee),
          };
        } else {
          // failed keysend
          log.info(`Keysend failed: ${res.message}`);
          return {
            success: false,
            msatAmount: keysend.msatAmount,
            pubkey: keysend.pubkey,
            feeMsat: 0,
          };
        }
      })
    );

    res
      .status(200)
      .json({ success: true, data: { keysends: processedResponses } });
  } catch (e) {
    log.error(`Error processing external keysends: ${e}`);
    res.status(500).json({ success: false, error: "External keysend failed" });
  }
});

const createSend = asyncHandler(async (req, res: any, next) => {
  const userId = req["uid"];
  const request = {
    contentId: req.body.contentId,
    msatAmount: req.body.msatAmount,
    comment: req.body.comment,
    contentTime: req.body.contentTime ? req.body.contentTime : null,
  };

  if (isNaN(request.msatAmount || request.msatAmount < 1000)) {
    return res
      .status(400)
      .json({ success: false, error: "Amount should be a positive number" });
  }

  if (!request.contentId || !validate(request.contentId)) {
    res.status(400).json({
      success: false,
      error: "Request does not contain a valid content id",
    });
    return;
  }

  log.info(`Checking if user ${userId} has sufficient sats`);
  const userHasSufficientSats = await checkUserHasSufficientSats(
    userId,
    request.msatAmount
  );

  if (!userHasSufficientSats) {
    return res
      .status(400)
      .json({ success: false, error: "Insufficient balance" });
  }

  log.info(`Creating amp transaction for user ${userId}`);

  const amp = await processSplits({
    contentId: request.contentId,
    userId: userId,
    paymentType: request.comment ? 2 : 1,
    msatAmount: request.msatAmount,
    comment: request.comment,
    contentTime: request.contentTime,
  });

  if (!amp) {
    log.error(`Error processing splits for user ${userId}`);
    return res
      .status(500)
      .json({ success: false, error: "Error processing splits" });
  }

  return res.status(200).json({ success: true, data: { amp } });
});

export default { createSend, sendKeysend };

import asyncHandler from "express-async-handler";
import {
  checkUserHasSufficientSats,
  isValidExternalKeysendRequest,
} from "@library/keysends/validations";
import core from "express-serve-static-core";
import {
  ExternalKeysendRequest,
  ExternalKeysendResponse,
  ExternalKeysendResult,
} from "@library/keysends/interfaces";
import log from "loglevel";
import { sendKeysend as zbdSendKeysend } from "@library/zbd/zbdClient";
import {
  constructCustomRecords,
  constructKeysendMetadata,
  recordSuccessfulKeysend,
} from "@library/keysends/outgoingKeysend";
import { validate } from "uuid";
import { processSplits } from "@library/amp";

const feeLimitMsat = 20000; // Hard-coding for external keysends for now

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
  log.debug(`Processing external keysend request for user ${userId}`);
  try {
    const isValidRequest = isValidExternalKeysendRequest(body);
    if (!isValidRequest) {
      res.status(500).json({ success: false, error: "Invalid request" });
      return;
    }
    // Check user balance
    const userHasSufficientSats = await checkUserHasSufficientSats(
      userId,
      msatTotal + feeLimitMsat // Add estimated fee limit
    );

    if (!userHasSufficientSats) {
      res.status(403).json({ success: false, error: "Insufficient balance" });
      return;
    }

    const responses = await Promise.all(
      keysends.map(async (keysend) => {
        const keysendMetadata = await constructKeysendMetadata(userId, body);

        const customRecords = constructCustomRecords(keysend, keysendMetadata);
        const res = await zbdSendKeysend({
          amount: keysend.msatAmount.toString(),
          pubkey: keysend.pubkey,
          // TODO determine what we need to add here
          metadata: {
            message,
            podcast,
            guid,
            feedId,
            episode,
            episodeGuid,
            ts,
            userId,
            name: keysend.name,
          },
          tlvRecords: customRecords,
        });
        return {
          response: res,
          request: keysend,
        };
      })
    );

    const processedResponses: ExternalKeysendResult[] = await Promise.all(
      responses.map(async ({ response, request }) => {
        if (!response) {
          return {
            success: false,
            msatAmount: request.msatAmount,
            pubkey: request.pubkey,
            feeMsat: 0,
          };
        }

        if (response.success) {
          // response from zbd
          const { data } = response;
          // request sent to zbd
          const { pubkey, name } = request;
          recordSuccessfulKeysend({
            keysendData: data,
            pubkey,
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
            // this is not really true if the payment is in flight
            success: true,
            msatAmount: request.msatAmount,
            pubkey: request.pubkey,
            feeMsat: parseInt(data.transaction.fee),
          };
        }

        // failed keysend
        // TODO - should we record failed keysends in the db?
        log.debug(`Keysend failed: ${response.message}`);
        return {
          success: false,
          msatAmount: request.msatAmount,
          pubkey: request.pubkey,
          feeMsat: 0,
        };
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
    return res.status(500).send("Error processing splits");
  }

  return res.status(200).json({ success: true, data: { amp } });
});

export default { createSend, sendKeysend };

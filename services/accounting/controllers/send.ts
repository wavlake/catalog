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
import db from "@library/db";
import { sendKeysend as zbdSendKeysend } from "@library/zbd/zbdClient";
import { randomUUID } from "crypto";
import {
  constructCustomRecords,
  constructKeysendMetadata,
} from "@library/keysends/outgoingKeysend";

const COMPLETE_STATUS = "completed";
const FAILED_STATUS = "failed";
const getIsInFlight = (status: string) =>
  ![FAILED_STATUS, COMPLETE_STATUS].includes(status);
const getIsSettled = (status: string) => status === COMPLETE_STATUS;

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
          // metadata: {},
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
          const { data } = response;
          const { pubkey, name } = request;
          const trx = await db.knex.transaction();
          const txId = randomUUID();
          const isSettled = getIsSettled(data.transaction.status);
          const isInFlight = getIsInFlight(data.transaction.status);
          trx("external_payment").insert(
            {
              user_id: userId,
              // do we still need to store the payment_index?
              // payment_index: paymentIndex,
              // the msat_amount does not include the fee
              msat_amount: data.transaction.amount,
              fee_msat: data.transaction.fee,
              pubkey,
              name,
              message,
              podcast,
              guid,
              feed_id: feedId,
              episode,
              episode_guid: episodeGuid,
              ts,
              is_settled: isSettled,
              in_flight: isInFlight,
              tx_id: txId,
            },
            ["id"]
          );

          if (isSettled || isInFlight) {
            // decrement the user balance
            // if the payment fails and we are notified of the failure via callback
            // we refund the user balance
            trx("user")
              .decrement({
                msat_balance:
                  parseInt(data.transaction.amount) +
                  parseInt(data.transaction.fee),
              })
              .update({ updated_at: db.knex.fn.now() })
              .where({ id: userId });
          }

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

export default { sendKeysend };

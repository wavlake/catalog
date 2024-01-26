const log = require("loglevel");
import db from "./db";
const { buildAmpTx } = require("./amp");
const { getUserName } = require("./userHelper");
const crypto = require("crypto");
const { randomUUID } = require("crypto");
import { ExternalKeysend, ExternalKeysendRequest } from "../types/keysend";
import { sendKeysend } from "./zbdClient";

const feeLimitMsat = 5000; // Hard-coding for external keysends for now (see also controllers/ampExternal.js)

const wavlakePubkey = process.env.RECEIVING_PUBLIC_KEY;

async function checkIfKeysendIsInternal(keysend) {
  if (keysend.pubkey != wavlakePubkey) {
    return false;
  } else {
    if (keysend.customKey == 16180339) {
      return true;
    }
    return false;
  }
}

async function constructKeysendMetadata(userId, externalKeysendRequest) {
  const senderName = await getUserName(userId);

  // Per blip-10: https://github.com/Podcastindex-org/podcast-namespace/blob/main/value/blip-0010.md
  let keysendRequest = {
    message: externalKeysendRequest.message ?? null,
    podcast: externalKeysendRequest.podcast ?? null,
    guid: externalKeysendRequest.guid ?? null,
    feed_id: externalKeysendRequest.feedID ?? null,
    episode: externalKeysendRequest.episode ?? null,
    episode_guid: externalKeysendRequest.episodeGuid ?? null,
    ts: externalKeysendRequest.ts ?? null,
    value_msat_total: externalKeysendRequest.msatTotal,
    action: "boost",
    app_name: "Wavlake",
    sender_name: senderName,
  };

  // Remove keys with null values
  Object.keys(keysendRequest).forEach(
    (key) => keysendRequest[key] == null && delete keysendRequest[key]
  );

  return keysendRequest;
}

async function constructCustomRecords(keysend, keysendMetadata) {
  let customRecords = [];
  // Add standard values
  customRecords.push({ type: 7629169, value: JSON.stringify(keysendMetadata) });
  // Add custom key/value if exists
  if (keysend.customKey && keysend.customValue) {
    const customKey = parseInt(keysend.customKey);
    customRecords.push({
      type: customKey,
      // value: Buffer.from(keysend.customValue.toString("hex")),
      value: keysend.customValue,
    });
  }

  console.log(customRecords);
  return customRecords;
}

async function findContentIdFromCustomKey(customKey, customValue) {
  if (customKey == 16180339) {
    return customValue;
  } else return null;
}

function logExternalKeysend({
  userId,
  paymentIndex,
  feeMsat,
  keysend,
  keysendMetadata,
  isSettled,
  trx,
  txId,
}) {
  // Store payment id in db (for callback)
  return trx("external_payment")
    .insert(
      {
        user_id: userId,
        payment_index: paymentIndex,
        msat_amount: keysend.msatAmount,
        fee_msat: feeMsat,
        pubkey: keysend.pubkey,
        name: keysend.name,
        message: keysendMetadata.message,
        podcast: keysendMetadata.podcast,
        guid: keysendMetadata.guid,
        feed_id: keysendMetadata.feed_id,
        episode: keysendMetadata.episode,
        episode_guid: keysendMetadata.episode_guid,
        ts: keysendMetadata.ts,
        is_settled: isSettled,
        tx_id: txId,
      },
      ["id"]
    )
    .then(() => {
      if (isSettled) {
        // Decrement user balance
        return trx("user")
          .decrement({
            msat_balance: parseInt(keysend.msatAmount) + parseInt(feeMsat),
          })
          .update({ updated_at: db.knex.fn.now() })
          .where({ id: userId });
      }
    })
    .then(trx.commit)
    .then((data) => {
      log.debug(
        `Created external payment record for ${userId} to ${keysend.pubkey} at payment index ${paymentIndex}`
      );
    })
    .catch((err) => {
      log.error(`Error creating external payment record: ${err}`);
      trx.rollback;
    });
}

async function sendExternalKeysend(keysend, keysendMetadata) {
  log.debug(
    `Sending external keysend: ${keysend.pubkey}, amount: ${keysend.msatAmount}`
  );

  if (keysend.msatAmount < 1) {
    log.error(`Invalid msat amount: ${keysend.msatAmount}`);
    return null;
  }
  // Keysend Protocol reference: https://github.com/alexbosworth/keysend_protocols

  const customRecords = await constructCustomRecords(keysend, keysendMetadata);

  // TODO: Replace with ZBD API
  const sendKeysendResult = await sendKeysend({
    amount: keysend.msatAmount.toString(),
    pubkey: keysend.pubkey,
    // tlvRecords: customRecords,
  });

  console.log(JSON.stringify(sendKeysendResult));
  if (sendKeysendResult.success) {
    if (sendKeysendResult.data.transaction.status === "completed") {
      log.debug(
        `External keysend success: ${sendKeysendResult.data.keysendId}`
      );
      return {
        success: true,
        // payment_index name is legacy from lnd
        // external_payment table uses payment_index to store keysendId from ZBD
        paymentIndex: sendKeysendResult.data.paymentId,
        feeMsat: sendKeysendResult.data.transaction.fee,
      };
    } else {
      log.debug(
        `External keysend still in flight or unknown: ${sendKeysendResult.data.transaction.status}`
      );
      log.debug(sendKeysendResult);
      return { success: false, paymentIndex: sendKeysendResult.data.keysendId };
    }
  } else {
    log.debug(`External keysend failed: ${sendKeysendResult.data.keysendId}`);
    return { success: false, paymentIndex: sendKeysendResult.data.keysendId };
  }
}

exports.isValidExternalKeysendRequest = async (externalKeysendRequest) => {
  const hasKeysendArray = Array.isArray(externalKeysendRequest?.keysends);
  if (!hasKeysendArray) {
    return false;
  }
  if (!externalKeysendRequest?.msatTotal) {
    return false;
  }
  let hasValidKeysends = false;
  let msatSumKeysends = 0;
  externalKeysendRequest.keysends.forEach((keysend) => {
    // Check if keysend has msatAmount and pubkey at a minimum
    // Also check if msatAmounts sum up to msatTotal
    if (keysend.msatAmount && keysend.pubkey) {
      hasValidKeysends = true;
      msatSumKeysends += parseInt(keysend.msatAmount);
    } else {
      return false;
    }
  });
  if (msatSumKeysends != externalKeysendRequest.msatTotal) {
    return false;
  }
  return hasValidKeysends;
};

exports.processKeysends = async (userId, externalKeysendRequest) => {
  const { message } = externalKeysendRequest;
  // NOTE: User's balance will be decremented per keysend
  //   a. Check for keysends that are internal using pubkey
  //     i. Get track id from custom key `16180339`
  //     ii. Use amp library to make transaction
  //   b. For external payments:
  //     i. Attempt payment
  //        A. Must create preimage and preimage hash
  //        B. Hash must be submitted along with payment
  //        C. Also must send TLV record `5482373484` with value of 32 Byte Preimage Corresponding to HTLC Preimage Hash
  //     ii. Store payment id in db (for callback)
  const keysendMetadata = await constructKeysendMetadata(
    userId,
    externalKeysendRequest
  );

  const txId = randomUUID(); // Generate unique txId for this batch of keysends

  log.debug(
    `Processing external keysends for user ${userId} for amount ${externalKeysendRequest.msatTotal} msats`
  );
  // List to store results of each keysend for response
  let keysendResults = [];

  await Promise.all(
    externalKeysendRequest.keysends.map(async (keysend) => {
      const keysendIsInternal = await checkIfKeysendIsInternal(keysend);
      try {
        if (keysendIsInternal) {
          const trx = await db.knex.transaction();

          const contentId = await findContentIdFromCustomKey(
            keysend.customKey,
            keysend.customValue
          );

          log.debug(
            `Creating internal amp from external keysend for user: ${userId} to ${contentId}`
          );

          const amp = buildAmpTx({
            trx: trx,
            res: null,
            npub: null,
            msatAmount: keysend.msatAmount,
            contentId: contentId,
            type: 9,
            comment: message,
            userId: userId,
            externalTxId: txId,
            boostData: {
              podcast: keysendMetadata.podcast,
              episode: keysendMetadata.episode,
              app_name: keysendMetadata.app_name,
              sender_name: keysendMetadata.sender_name,
            },
          });
          if (amp) {
            keysendResults.push({
              success: true,
              msatAmount: keysend.msatAmount,
              pubkey: keysend.pubkey,
              feeMsat: 0,
            });
          } else {
            keysendResults.push({
              success: false,
              msatAmount: keysend.msatAmount,
              pubkey: keysend.pubkey,
              feeMsat: 0,
            });
          }
        } else {
          const externalKeysendResult = await sendExternalKeysend(
            keysend,
            keysendMetadata
          );
          const trx = await db.knex.transaction();
          console.log(
            `externalKeysendResult: ${JSON.stringify(externalKeysendResult)}`
          );

          if (externalKeysendResult) {
            logExternalKeysend({
              userId: userId,
              paymentIndex: externalKeysendResult.paymentIndex,
              feeMsat: externalKeysendResult.feeMsat ?? 0,
              keysend: keysend,
              keysendMetadata: keysendMetadata,
              isSettled: externalKeysendResult.success,
              trx: trx,
              txId: txId,
            });

            keysendResults.push({
              name: keysend.name,
              success: externalKeysendResult.success,
              msatAmount: keysend.msatAmount,
              pubkey: keysend.pubkey,
              feeMsat: parseInt(externalKeysendResult.feeMsat) ?? 0,
            });
          } else {
            log.error(
              `Something went wrong with keysend from ${userId} to ${keysend.pubkey}`
            );

            keysendResults.push({
              name: keysend.name,
              success: false,
              msatAmount: keysend.msatAmount,
              pubkey: keysend.pubkey,
              feeMsat: 0,
            });
          }
        }
      } catch (err) {
        log.error(`Error processing external keysend: ${err}`);
        keysendResults.push({
          name: keysend.name,
          success: false,
          msatAmount: keysend.msatAmount,
          pubkey: keysend.pubkey,
          feeMsat: 0,
        });
      }
    })
  ).catch((err) => {
    log.error(`Error processing external keysends: ${err}`);
  });
  // log.debug(keysendResults);
  return keysendResults;
};

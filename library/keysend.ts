import log from "loglevel";
import db from "./db";
import { getUserName } from "./userHelper";
import { randomUUID } from "crypto";
import { sendKeysend } from "./zbd";

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

export interface KeysendMetadata {
  message?: string;
  podcast?: string;
  guid?: string;
  feed_id?: string;
  episode?: string;
  episode_guid?: string;
  ts?: string;
  value_msat_total?: string;
  action?: string;
  app_name?: string;
  sender_name?: string;
}

async function constructKeysendMetadata(userId, externalKeysendRequest) {
  const senderName = await getUserName(userId);

  // Per blip-10: https://github.com/Podcastindex-org/podcast-namespace/blob/main/value/blip-0010.md
  let keysendRequest: KeysendMetadata = {
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

async function constructCustomRecords(
  keysend,
  keysendMetadata: KeysendMetadata
) {
  let customRecords = [];
  // Add standard value for blip-10
  // https://github.com/lightning/blips/blob/master/blip-0010.md
  const BLIP0010 = "7629169";
  customRecords.push({
    type: BLIP0010,
    // covert to hex
    value: Buffer.from(JSON.stringify(keysendMetadata)).toString("hex"),
  });
  // Add custom key/value if exists
  if (keysend.customKey && keysend.customValue) {
    const customKey = parseInt(keysend.customKey).toString();
    customRecords.push({
      type: customKey,
      // convert to hex
      value: Buffer.from(keysend.customValue).toString("hex"),
    });
  }

  log.info(customRecords);
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
      log.info(
        `Created external payment record for ${userId} to ${keysend.pubkey} at payment index ${paymentIndex}`
      );
    })
    .catch((err) => {
      log.error(`Error creating external payment record: ${err}`);
      trx.rollback;
    });
}

export const isValidExternalKeysendRequest = async (externalKeysendRequest) => {
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

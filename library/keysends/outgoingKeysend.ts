import { randomUUID } from "crypto";
import db from "../db";
import { getUserName } from "../userHelper";

const BLIP0010 = "7629169";
const COMPLETE_STATUS = "completed";
const FAILED_STATUS = "failed";
// this needs to be updated once we know all possible statuses
const getIsInFlight = (status: string) =>
  ![FAILED_STATUS, COMPLETE_STATUS].includes(status);
const getIsSettled = (status: string) => status === COMPLETE_STATUS;

export const recordKeysend = async ({ keysendData, pubkey, metadata }) => {
  // unsure what to use for payment index
  const {
    name,
    message,
    feedId,
    episode,
    episodeGuid,
    ts,
    podcast,
    guid,
    userId,
  } = metadata;
  const trx = await db.knex.transaction();
  const txId = randomUUID();
  const isSettled = getIsSettled(keysendData.transaction.status);
  const isInFlight = getIsInFlight(keysendData.transaction.status);
  trx("external_payment").insert(
    {
      user_id: userId,
      external_id: keysendData.transaction.id,
      // the msat_amount does not include the fee
      msat_amount: keysendData.transaction.amount,
      fee_msat: keysendData.transaction.fee,
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

  // decrement the user balance if the payment is settled
  if (isSettled) {
    trx("user")
      .decrement({
        msat_balance:
          parseInt(keysendData.transaction.amount) +
          parseInt(keysendData.transaction.fee),
      })
      .update({ updated_at: db.knex.fn.now() })
      .where({ id: userId });
  }

  return trx
    .commit()
    .then((data) => {
      log.debug(
        `Created external payment record for ${userId} to ${keysend.pubkey}, external_id: ${keysendData.transaction.id}`
      );
    })
    .catch((err) => {
      log.error(`Error creating external payment record: ${err}`);
      trx.rollback;
    });
};

export function constructCustomRecords(keysend, keysendMetadata) {
  const customRecords = [
    {
      type: BLIP0010,
      value: Buffer.from(JSON.stringify(keysendMetadata)).toString("hex"),
    },
    // Add custom key/value if exists
    ...(keysend.customKey && keysend.customValue
      ? [
          {
            type: keysend.customKey.toString(),
            value: Buffer.from(keysend.customValue).toString("hex"),
          },
        ]
      : []),
  ];

  return customRecords;
}

export async function constructKeysendMetadata(userId, externalKeysendRequest) {
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

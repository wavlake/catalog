import { TransactionStatus, SendKeysendStatus } from "./../zbd/constants";
import db from "../db";
import { getUserName } from "../userHelper";
import log from "../logger";

const BUFFER_AMOUNT = 0.15;
const BLIP0010 = "7629169";

export const recordInProgressKeysend = async ({
  keysendData,
  pubkey,
  internalTxId,
  metadata,
}) => {
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
  const estimatedFee = keysendData.transaction.amount * BUFFER_AMOUNT;
  return db.knex("external_payment").insert(
    {
      user_id: userId,
      external_id: keysendData.transaction.id,
      // the msat_amount does not include the fee
      msat_amount: keysendData.transaction.amount,
      // if the keysend is inflight, we estimate the fee
      // sometimes the payment is already settled and we have the actual fee
      fee_msat: keysendData.transaction.fee || estimatedFee,
      pubkey: pubkey,
      name: name,
      message: message,
      podcast: podcast,
      guid: guid,
      feed_id: feedId,
      episode: episode,
      episode_guid: episodeGuid,
      ts: ts,
      // we rely on the callback to update the payment as settled and is_pending = false
      is_settled: false,
      is_pending: true,
      tx_id: internalTxId,
    },
    ["id"]
  );
};

export const updateKeysend = async ({
  internalTxId,
  status,
  fee,
}: {
  internalTxId: string;
  status: SendKeysendStatus;
  fee: string;
}) => {
  // We use 1000 msat for the fee to account for the default 1 sat fee in case of 0 fee amount
  const feeMsat = parseInt(fee) === 0 ? 1000 : parseInt(fee);
  const keysendRecord = await db
    .knex("external_payment")
    .where({ tx_id: internalTxId })
    .select("is_settled", "user_id", "msat_amount")
    .first();

  if (!keysendRecord) {
    log.error(`Keysend not found for ${internalTxId}`);
    return;
  }

  if (keysendRecord.is_settled) {
    log.info("Keysend already settled, skipping update");
    return;
  }

  const isSettled = status === SendKeysendStatus.Paid;
  const trx = await db.knex.transaction();

  if (isSettled) {
    // decrement the user balance if the payment is settled
    await trx("user")
      .decrement({
        msat_balance: parseInt(keysendRecord.msat_amount) + feeMsat,
      })
      .update({ updated_at: db.knex.fn.now() })
      .where({ id: keysendRecord.user_id });
  }

  await trx("external_payment").where({ tx_id: internalTxId }).update({
    is_settled: isSettled,
    is_pending: false,
    fee_msat: feeMsat,
  });

  return trx
    .commit()
    .then(() => {
      log.info(
        `Updated external_payment record for ${internalTxId} with status ${status}`
      );
    })
    .catch((err) => {
      log.error(`Error updating external_payment record: ${err}`);
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

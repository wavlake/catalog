import { randomUUID } from "crypto";
import db from "../db";
import { getUserName } from "../userHelper";
import log from "loglevel";

const BLIP0010 = "7629169";
const COMPLETE_STATUS = "completed";

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
  const BUFFER_AMOUNT = 0.15;
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
      pubkey,
      name,
      message,
      podcast,
      guid,
      feed_id: feedId,
      episode,
      episode_guid: episodeGuid,
      ts,
      // we rely on the callback to update the payment as settled and is_pending = false
      is_settled: false,
      is_pending: true,
      tx_id: randomUUID(),
    },
    ["id"]
  );
};

export const updateKeysend = async ({
  externalId,
  status,
  fee,
}: {
  externalId: string;
  status: string;
  fee: any;
}) => {
  const feeMsat = parseInt(fee);
  const currentKeysend = await db
    .knex("external_payment")
    .where({ external_id: externalId })
    .select("is_settled", "user_id", "msat_amount")
    .first();

  if (currentKeysend.is_settled) {
    log.debug("Keysend already settled, skipping update");
    return;
  }

  const isSettled = getIsSettled(status);
  const trx = await db.knex.transaction();

  if (isSettled) {
    // decrement the user balance if the payment is settled
    trx("user")
      .decrement({
        msat_balance: parseInt(currentKeysend.msat_amount) + feeMsat,
      })
      .update({ updated_at: db.knex.fn.now() })
      .where({ id: currentKeysend.user_id });
  }

  await trx("external_payment")
    .where({ external_id: externalId, status })
    .update({
      is_settled: isSettled,
      is_pending: false,
      fee_msat: feeMsat,
    });
  return trx
    .commit()
    .then((data) => {
      log.debug(
        `Updated external payment record for ${externalId} with status ${status}`
      );
    })
    .catch((err) => {
      log.error(`Error updating external payment record: ${err}`);
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

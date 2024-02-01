import db from "../db";
// For amps from logged-in users to external feeds
export const processOutgoingKeysend = async () => {
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
};

export function constructCustomRecords(keysend, keysendMetadata) {
  const customRecords = [
    {
      type: "7629169",
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

async function getUserName(userId) {
  return db
    .knex("user")
    .select("name")
    .where("id", "=", userId)
    .first()
    .then((data) => {
      return data.name;
    })
    .catch((err) => {
      log.error(`Error finding user from userId ${err}`);
    });
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


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
const log = require("loglevel");
import db from "./db";
const { getType } = require("./content");
import split from "./split";
// const {
//   calculateCombinedSplits,
//   getSplitRecipientsAndShares,
//   getTimeSplit,
// } = require("./split");
const { randomUUID } = require("crypto");

const ampFee = parseFloat(`${process.env.AMP_FEE}`);

// This is like the master function
// It figures out if there are any splits and builds the txs accordingly
exports.buildAmpTx = async ({
  res,
  trx,
  contentId,
  userId,
  npub,
  msatAmount,
  contentTimeSeconds = -1,
  type = 1,
  settleIndex = 0,
  preimage = null,
  rHashStr = null,
  comment = null,
  isNostr = false,
  boostData = null,
  externalTxId = null,
  isNwc = false, // flag for if this is an internal NWC tx
}) => {
  const txId = externalTxId ? externalTxId : randomUUID();
  log.debug(`Building amp tx: ${txId}`);
  const contentType = await getType(contentId);
  if (!contentType) {
    log.error(`No record found for content id ${contentId}`);
    res ? res.status(500).send("Content id does not exists") : false;
    return;
  }
  // If contentTimeSeconds, query the time_split table to see if there is a time split
  const timeSplit =
    contentTimeSeconds === -1
      ? null
      : await split.getTimeSplit(contentId, contentTimeSeconds);

  // Check for splits, return a list of recipients and their splitPercentage.
  // Object will look something like:
  // [
  //   { userId: "barney", splitPercentage: 0.7 },
  //   { userId: "fred", splitPercentage: 0.3 },
  // ]
  const splitRecipients = await split.getSplitRecipientsAndShares(
    contentId,
    contentType
  );
  log.debug(`Split recipients: `, splitRecipients);

  // Use the values from timeSplit and splitRecipients to calculate the final splits
  // Object will look something like:
  // [
  //   { userId: "barney", splitPercentage: 0.3 },
  //   { userId: "fred", splitPercentage: 0.2 },
  //   { userId: "wilma", splitPercentage: 0.5 },
  // ]
  const calculatedSplits = timeSplit
    ? split.calculateCombinedSplits(splitRecipients, timeSplit)
    : splitRecipients;
  log.debug(`Calculated splits: `, calculatedSplits);

  log.info(`AMP attempt: ${msatAmount} msat by ${userId} to ${contentId}`);

  // Build and return trx object, which will be committed if successful
  // Increment content balance
  return (
    trx(contentType)
      .where({ id: contentId })
      .increment({ msat_total: msatAmount })
      .update({ updated_at: db.knex.fn.now() })
      // Log preamp tx
      .then(() => {
        return trx("preamp").insert({
          tx_id: txId,
          user_id: isNwc ? npub : userId,
          content_id: contentId,
          msat_amount: msatAmount,
          guid: boostData?.guid,
          podcast: boostData?.podcast,
          feed_id: boostData?.feed_id,
          episode: boostData?.episode,
          item_id: boostData?.item_id,
          ts: boostData?.ts,
          app_name: boostData?.app_name,
          sender_name: boostData?.sender_name,
          created_at: db.knex.fn.now(),
        });
      })
      .then(() => {
        // Increment recipient balances
        return Promise.all(
          calculatedSplits.map((recipient) => {
            return trx("user")
              .where({ id: recipient.userId })
              .increment({
                msat_balance: Math.floor(
                  msatAmount * recipient.splitPercentage * (1 - ampFee)
                ),
              })
              .update({ updated_at: db.knex.fn.now() });
          })
        );
      })
      .then(() => {
        // Add individual amp records
        return Promise.all(
          calculatedSplits.map((recipient) => {
            return trx("amp").insert({
              track_id: contentId,
              user_id: isNwc ? npub : userId,
              type: type,
              type_key: settleIndex,
              msat_amount: Math.floor(msatAmount * recipient.splitPercentage),
              fee_msat: Math.floor(
                msatAmount * recipient.splitPercentage * ampFee
              ),
              split_destination: recipient.userId,
              tx_id: txId,
              content_type: contentType ? contentType : "track", // fallback to track
            });
          })
        );
      })
      .then(() => {
        // Add external receive record if external
        if (settleIndex > 0) {
          return trx("external_receive").insert({
            settle_index: settleIndex,
            track_id: contentId,
            preimage: preimage,
            payment_hash: rHashStr,
          });
        } else {
          return;
        }
      })
      .then(() => {
        // Decrement sender balance if local
        if (type === 1 || type === 2 || type === 9 || type === 10) {
          return trx("user")
            .decrement({ msat_balance: msatAmount })
            .update({ updated_at: db.knex.fn.now() })
            .where({ id: userId });
        } else {
          return;
        }
      })
      .then(() => {
        // Add comment if present
        if (comment) {
          return trx("comment").insert({
            user_id: isNwc ? npub : userId,
            content: comment,
            amp_id: 0, // Irrelevant now b/c amps can be split but keeping for backwards compatibility
            tx_id: txId,
            content_id: contentId,
            content_type: contentType,
            is_nostr: isNostr,
          });
        } else {
          return;
        }
      })
      .then(trx.commit)
      .then(() => {
        log.info(
          `AMP type ${type} success: ${msatAmount} msat by ${userId} to ${contentId}`
        );
        return res ? res.sendStatus(200) : true;
      })
      .catch((e) => {
        log.error(`Error commiting amp tx: ${e}`);
        trx.rollback;
        log.info(
          `ERROR: AMP type ${type}: ${msatAmount} msat by ${userId} to ${contentId}`
        );
        // If there is no response object we don't need to do anything
        // This is mainly so the external keysend function can use this function
        return res ? res.status(500).send("Something went wrong") : false;
      })
  );
};

export default exports;

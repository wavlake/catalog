import { randomUUID } from "crypto";
import db from "./db";
import {
  addLightningAddresses,
  calculateCombinedSplits,
  getSplitRecipientsAndShares,
  getTimeSplit,
} from "./split";
import { getType } from "./content";
import log from "./logger";

const AMP_FEE = 0.1; // 10% fee

interface Referrer {
  id: string;
  share: number;
  userId: string;
  lightningAddress: string;
  verifiedUserId: string;
  shareDecimal?: number;
}

// Payment Types:
// 1: Standard boost
// 2: Boost with comment
// 3: Reply
// 4: Comment boost
// 5: Keysend boost
// 6: Invoice boost
// 7: Zap
// 8: Party mode boost
// 9: Internal boost via external time split
// 10: NWC internal payment

// this will look up the content and associated splits and do the following:
// 1. process the splits and adjust user/content balances
// 2. add a new record to the preamp table
// 3. add a new record to the amp table, a record for each split recipient
// 4. add a new record to the external_receive table
// 5. if there is a comment, add a new record to the comment table
// 6. these db operations are all wrapped in a transaction so they are atomic
// 7. if this an internal payment, decrement the sender's balance
export const processSplits = async ({
  contentId,
  contentTime,
  msatAmount,
  userId,
  npub = null, // This value only comes from NWC payments
  externalTxId = randomUUID(),
  paymentType = 1,
  boostData = undefined,
  isNostr = false,
  preimage = null,
  rHashStr = null,
  comment = null,
  settleIndex = 0,
  referrerAppId = null,
  ///////// TEMPORARY - REMOVE AFTER 240728 /////////
  isConferenceZap = false,
}: /////////
{
  contentId: string;
  contentTime: number;
  msatAmount: number;
  paymentType: number;
  // userId or npub, else this will be hardcoded to keysend or invoice
  userId?: string;
  npub?: string;
  externalTxId?: string;
  boostData?: any;
  isNostr?: boolean;
  preimage?: string;
  rHashStr?: string;
  comment?: string;
  settleIndex?: number;
  referrerAppId?: string;
  ///////// TEMPORARY - REMOVE AFTER 240728 /////////
  isConferenceZap?: boolean;
  /////////
}) => {
  log.info(`Building amp tx: ${externalTxId}`);
  const contentType = await getType(contentId);
  log.info(`Content type: ${contentType}`);
  if (!contentType) {
    log.error(`No record found for content id ${contentId}`);
    return;
  }

  const timeSplit = await getTimeSplit(
    contentId,
    Number(contentTime),
    contentType
  );

  if (timeSplit) {
    log.info(`Time split: `, timeSplit);
  }
  // Check for splits, return a list of recipients and their splitPercentage.
  // Object will look something like:
  // [
  //   { userId: "barney", splitPercentage: 0.7 },
  //   { userId: "fred", splitPercentage: 0.3 },
  // ]
  const splitRecipients: any[] = await getSplitRecipientsAndShares(
    contentId,
    contentType
  );

  // Use the values from timeSplit and splitRecipients to calculate the final splits
  // Object will look something like:
  // [
  //   { userId: "barney", splitPercentage: 0.3, contentId: "123" },
  //   { userId: "fred", splitPercentage: 0.2, contentId: "123" },
  //   { userId: "wilma", splitPercentage: 0.5, contentId: "456" },
  // ]
  const calculatedSplits = timeSplit
    ? await calculateCombinedSplits(splitRecipients, timeSplit)
    : splitRecipients;

  const lightningAddressSplits = await addLightningAddresses(calculatedSplits);

  const keysendType = 5;
  const userIdForDb = userId
    ? userId
    : paymentType === keysendType
    ? "keysend"
    : "invoice";

  log.info(`AMP attempt: ${msatAmount} msat by ${userIdForDb} to ${contentId}`);

  // Lookup referrer app if present
  const referrer: Referrer = await getReferrer(referrerAppId);

  const trx = await db.knex.transaction();
  const ampTx = await trx("preamp").insert({
    tx_id: externalTxId,
    user_id: npub ? npub : userIdForDb,
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
    referrer_app_id: referrer?.id ?? null,
    referrer_share: referrer?.share ?? null,
  });

  // Increment balances for recipients without lightning addresses
  await Promise.all(
    lightningAddressSplits.map((recipient) => {
      if (!recipient.lightningAddress || recipient.lightningAddress === "") {
        return trx("user")
          .where({ id: recipient.userId })
          .increment({
            msat_balance: Math.floor(
              msatAmount * recipient.splitPercentage * (1 - AMP_FEE)
            ),
          })
          .update({ updated_at: db.knex.fn.now() });
      }
    })
  );

  // Create forward records for lightning address users
  await Promise.all(
    lightningAddressSplits.map((recipient) => {
      if (recipient.lightningAddress && recipient.lightningAddress !== "") {
        return trx("forward").insert({
          user_id: recipient.userId,
          msat_amount: Math.floor(
            msatAmount * recipient.splitPercentage * (1 - AMP_FEE)
          ),
          lightning_address: recipient.lightningAddress,
          tx_id: externalTxId,
        });
      }
    })
  );

  // Increment track balances
  await Promise.all(
    lightningAddressSplits.map((recipient) => {
      if (recipient.contentType === "track") {
        return trx("track")
          .where({ id: recipient.contentId })
          .increment({
            msat_total: Math.floor(msatAmount * recipient.splitPercentage), // Fee is excluded for tallying boosts
          })
          .update({ updated_at: db.knex.fn.now() });
      } else {
        return;
      }
    })
  );

  // Increment episode balances
  await Promise.all(
    lightningAddressSplits.map((recipient) => {
      if (recipient.contentType === "episode") {
        return trx("episode")
          .where({ id: recipient.contentId })
          .increment({
            msat_total: Math.floor(msatAmount * recipient.splitPercentage), // Fee is excluded for tallying boosts
          })
          .update({ updated_at: db.knex.fn.now() });
      } else {
        return;
      }
    })
  );

  // Increment podcast balances
  await Promise.all(
    lightningAddressSplits.map((recipient) => {
      if (recipient.contentType === "podcast") {
        return trx("podcast")
          .where({ id: recipient.contentId })
          .increment({
            msat_total: Math.floor(msatAmount * recipient.splitPercentage), // Fee is excluded for tallying boosts
          })
          .update({ updated_at: db.knex.fn.now() });
      } else {
        return;
      }
    })
  );

  // Increment album balances
  await Promise.all(
    lightningAddressSplits.map((recipient) => {
      if (recipient.contentType === "album") {
        return trx("album")
          .where({ id: recipient.contentId })
          .increment({
            msat_total: Math.floor(msatAmount * recipient.splitPercentage), // Fee is excluded for tallying boosts
          })
          .update({ updated_at: db.knex.fn.now() });
      } else {
        return;
      }
    })
  );

  // Increment artist balances
  await Promise.all(
    lightningAddressSplits.map((recipient) => {
      if (recipient.contentType === "artist") {
        return trx("artist")
          .where({ id: recipient.contentId })
          .increment({
            msat_total: Math.floor(msatAmount * recipient.splitPercentage), // Fee is excluded for tallying boosts
          })
          .update({ updated_at: db.knex.fn.now() });
      } else {
        return;
      }
    })
  );

  // Add individual amp records
  await Promise.all(
    lightningAddressSplits.map((recipient) => {
      return trx("amp").insert({
        // track_id is really the content_id (track/episode/podcast/album/artist)
        track_id: recipient.contentId ? recipient.contentId : contentId,
        user_id: npub ? npub : userIdForDb,
        type: paymentType,
        type_key: settleIndex,
        msat_amount: Math.floor(msatAmount * recipient.splitPercentage),
        fee_msat: Math.floor(msatAmount * recipient.splitPercentage * AMP_FEE),
        split_destination: recipient.userId,
        tx_id: externalTxId,
        content_type: recipient.contentType ? recipient.contentType : "track", // fallback to track
      });
    })
  );

  // Add external receive record if external
  if (settleIndex > 0) {
    await trx("external_receive").insert({
      settle_index: settleIndex,
      track_id: contentId,
      preimage: preimage,
      payment_hash: rHashStr,
    });
  }

  // Decrement sender balance if local
  const localPaymentTypes = [1, 2, 9, 10];
  if (localPaymentTypes.includes(paymentType)) {
    await trx("user")
      .decrement({ msat_balance: msatAmount })
      .update({ updated_at: db.knex.fn.now() })
      .where({ id: userIdForDb });
  }

  // Add comment if present
  if (comment && !isConferenceZap) {
    await trx("comment").insert({
      user_id: npub ? npub : userIdForDb,
      content: comment,
      amp_id: 0, // Irrelevant now b/c amps can be split but keeping for backwards compatibility
      tx_id: externalTxId,
      content_id: contentId,
      content_type: contentType,
      is_nostr: isNostr,
    });
  }

  // Add referrer app transaction if present
  if (referrer?.id) {
    const payoutAmount: number = Math.floor(
      msatAmount * AMP_FEE * referrer.shareDecimal
    );
    // If referrer has a lightning address, add a forward record
    // Else, increment the referrer's balance
    if (referrer.lightningAddress && referrer.lightningAddress !== "") {
      await trx("forward").insert({
        user_id: referrer.userId,
        msat_amount: payoutAmount,
        lightning_address: referrer.lightningAddress,
        tx_id: externalTxId,
        referrer_app_id: referrer?.id ?? null,
      });
    } else {
      await trx("user")
        .where({ id: referrer.userId })
        .increment({
          msat_balance: payoutAmount,
        })
        .update({ updated_at: db.knex.fn.now() });
    }
  }

  return trx
    .commit()
    .then(() => {
      log.info(
        `AMP type ${paymentType} success: ${msatAmount} msat by ${userIdForDb} to ${contentId}`
      );
      return true;
    })
    .catch((e) => {
      log.error(`Error commiting amp tx: ${e}`);
      trx.rollback;
      log.info(
        `ERROR: AMP type ${paymentType}: ${msatAmount} msat by ${userIdForDb} to ${contentId}`
      );
      // If there is no response object we don't need to do anything
      // This is mainly so the external keysend function can use this function
      return false;
    });
};

const getReferrer = async (referrerAppId: string) => {
  if (!referrerAppId) {
    return null;
  }
  const referrer = await db
    .knex("referrer_app")
    .join("user", "referrer_app.user_id", "user.id")
    .leftOuterJoin("user_verification", "user.id", "user_verification.user_id")
    .where("referrer_app.id", "=", referrerAppId.toUpperCase())
    .select(
      "referrer_app.id",
      "referrer_app.share",
      "referrer_app.user_id as userId",
      "user.lightning_address as lightningAddress",
      "user_verification.user_id as verifiedUserId"
    )
    .first();

  if (!referrer) {
    log.error(`Referrer app id is invalid`);
    return;
  }

  // Convert share to a decimal
  referrer.shareDecimal = referrer.share / 100;
  return referrer;
};

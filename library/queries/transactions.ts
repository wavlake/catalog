import db from "../db";
import { TransactionType } from "../common";
import { validate } from "uuid";

function getDateFilter() {
  const filter = new Date();
  filter.setMonth(filter.getMonth() - 6);
  return filter.toISOString();
}

// DETAIL QUERIES
export function getTopUpDetail(userId, paymentId) {
  return db
    .knex("promo_reward")
    .join("promo", "promo.id", "=", "promo_reward.promo_id")
    .join("track", "track.id", "=", "promo.content_id")
    .select(
      db.knex.raw(
        `CAST(max("promo_reward"."created_at") as text) as "paymentId"`
      ),
      db.knex.raw("0 as feemsat"),
      db.knex.raw("true as success"),
      db.knex.raw(`'${TransactionType.TOPUP}' as type`),
      db.knex.raw(`ARRAY_AGG(DISTINCT("track"."title")) as title`),
      db.knex.raw(`false as isPending`),
      db.knex.raw("NULL as comment"),
      db.knex.raw("NULL as id"),
      db.knex.raw(`sum("msat_amount") as "msatAmount"`),
      db.knex.raw("NULL as failureReason"),
      db.knex.raw(`DATE("promo_reward"."created_at") as "created_at"`)
    )
    .where("user_id", "=", userId)
    .andWhere("promo_reward.is_pending", "=", false)
    .andWhere(db.knex.raw(`DATE("promo_reward"."created_at")`), "=", paymentId)
    .groupBy("user_id", db.knex.raw(`DATE("promo_reward"."created_at")`))
    .first();
}

export function getZapDetail(userId, paymentId) {
  return db
    .knex("transaction")
    .leftJoin(
      "zap_request",
      "zap_request.payment_hash",
      db.knex.raw(`CONCAT('transaction-', CAST("transaction"."id" as text))`)
    )
    .select(
      "transaction.fee_msat as feemsat",
      "transaction.success as success",
      db.knex.raw(`'${TransactionType.ZAP}' as type`),
      db.knex.raw("'' as title"),
      "transaction.is_pending as ispending",
      "transaction.lnurl_comment as comment",
      "transaction.id as id",
      "transaction.msat_amount as msatAmount",
      "transaction.failure_reason as failureReason",
      "transaction.created_at as created_at",
      "zap_request.event as zapEvent"
    )
    .where("transaction.id", "=", paymentId)
    .andWhere("transaction.user_id", "=", userId)
    .first();
}

export function getDepositDetail(userId, paymentId) {
  return db
    .knex("transaction")
    .select(
      db.knex.raw('CAST("transaction"."id" as text) as paymentid'),
      "transaction.fee_msat as feemsat",
      "transaction.success as success",
      db.knex.raw(`'${TransactionType.DEPOSIT}' as type`),
      db.knex.raw("'' as title"),
      "transaction.is_pending as ispending",
      "transaction.lnurl_comment as comment",
      "transaction.id as id",
      "transaction.msat_amount as msatAmount",
      "transaction.failure_reason as failureReason",
      "transaction.created_at as created_at"
    )
    .where("transaction.user_id", "=", userId)
    .andWhere("transaction.id", "=", paymentId)
    .first();
}

export function getWithdrawDetail(userId, paymentId) {
  return db
    .knex("transaction")
    .select(
      db.knex.raw('CAST("transaction"."id" as text) as paymentid'),
      "transaction.fee_msat as feemsat",
      "transaction.success as success",
      db.knex.raw(`'${TransactionType.WITHDRAW}' as type`),
      db.knex.raw("'' as title"),
      "transaction.is_pending as ispending",
      "transaction.id as id",
      "transaction.msat_amount as msatAmount",
      "transaction.failure_reason as failureReason",
      "transaction.created_at as created_at"
    )
    .where("transaction.user_id", "=", userId)
    .andWhere("transaction.id", "=", paymentId)
    .first();
}

export function getAutoforwardDetail(userId, paymentId) {
  return db
    .knex("forward_detail")
    .join(
      "forward",
      "forward.external_payment_id",
      "=",
      "forward_detail.external_payment_id"
    )
    .select(
      db.knex.raw(
        'CAST("forward_detail"."external_payment_id" as text) as paymentid'
      ),
      db.knex.raw("max(forward_detail.fee_msat) as feeMsat"),
      db.knex.raw("bool_and(forward_detail.success) as success"),
      db.knex.raw(`'${TransactionType.AUTOFORWARD}' as type`),
      db.knex.raw("max(forward.lightning_address) as title"),
      db.knex.raw("false as ispending"),
      db.knex.raw("'' as comment"),
      db.knex.raw("max(forward.external_payment_id) as id"),
      db.knex.raw("max(forward_detail.msat_amount) as msatAmount"),
      db.knex.raw("max(forward_detail.error) as failureReason"),
      db.knex.raw("max(forward_detail.created_at) as created_at")
    )
    .where("forward.user_id", "=", userId)
    .andWhere("forward_detail.external_payment_id", "=", paymentId)
    .groupBy("forward_detail.external_payment_id")
    .first();
}

export async function getZapSendDetail(userId, paymentId) {
  const isUuid = validate(paymentId);
  if (isUuid) {
    const amp = db
      .knex("amp")
      .join("preamp", "preamp.tx_id", "=", "amp.tx_id")
      .leftOuterJoin("track", "track.id", "=", "amp.track_id")
      .leftOuterJoin("album", "album.id", "=", "amp.track_id")
      .leftOuterJoin("artist", "artist.id", "=", "amp.track_id")
      .leftOuterJoin("episode", "episode.id", "=", "amp.track_id")
      .leftOuterJoin("podcast", "podcast.id", "=", "amp.track_id")
      .select(
        "preamp.msat_amount as msatAmount",
        "amp.created_at as created_at",
        db.knex.raw(
          'COALESCE("track"."title", "album"."title", "artist"."name", "episode"."title", "podcast"."name") as title'
        ),
        db.knex.raw("true as success"),
        db.knex.raw("0 as feemsat"),
        "amp.tx_id as id",
        db.knex.raw(`'${TransactionType.ZAP_SEND}' as type`)
      )
      .where("preamp.tx_id", paymentId)
      .andWhere("amp.user_id", userId);

    const externalPayment = db
      .knex("external_payment")
      .select(
        "msat_amount as msatAmount",
        "created_at as created_at",
        "podcast as title",
        "is_settled as success",
        "fee_msat as fee",
        "tx_id as id",
        db.knex.raw(`'${TransactionType.ZAP_SEND}' as type`)
      )
      .where("tx_id", paymentId)
      .andWhere("user_id", userId);

    return db.knex.union([amp, externalPayment]).as("zap_send").first();
  } else {
    return db
      .knex("nwc_wallet_transaction")
      .select(
        "msat_amount as msatAmount",
        "created_at as created_at",
        "id",
        db.knex.raw(`'${TransactionType.ZAP_SEND}' as type`)
      )
      .where("id", paymentId)
      .first();
  }
}

export function getEarningsDetail(userId, paymentId) {
  return db
    .knex("amp")
    .join("preamp", "preamp.tx_id", "=", "amp.tx_id")
    .leftOuterJoin("user", "user.id", "=", "amp.user_id")
    .leftOuterJoin("comment", "comment.tx_id", "=", "amp.tx_id")
    .leftOuterJoin("track", "track.id", "=", "amp.track_id")
    .leftOuterJoin("album", "album.id", "=", "amp.track_id")
    .leftOuterJoin("artist", "artist.id", "=", "amp.track_id")
    .leftOuterJoin("episode", "episode.id", "=", "amp.track_id")
    .leftOuterJoin("podcast", "podcast.id", "=", "amp.track_id")
    .select(
      "amp.user_id as userId",
      db.knex.raw('CAST("amp"."tx_id" as text) as id'),
      "amp.fee_msat as feemsat",
      db.knex.raw(`'${TransactionType.EARNINGS}' as type`),
      db.knex.raw(
        'COALESCE("track"."title", "album"."title", "artist"."name", "episode"."title") as title'
      ),
      "comment.content as comment",
      "amp.created_at as created_at",
      "preamp.msat_amount as msatAmount",
      "amp.msat_amount as splitMsatAmount",
      "preamp.podcast as podcast",
      "preamp.episode as episode",
      "preamp.app_name as appName",
      "user.artwork_url as commenterArtworkUrl",
      db.knex.raw(`COALESCE("user"."name", "preamp"."sender_name") as name`),
      // only return the nostrPublicHex if the user_id is a nostr public key of length 64
      db.knex.raw(`
        CASE 
          WHEN LENGTH("amp"."user_id") = 64 THEN "amp"."user_id"
          ELSE NULL
        END as nostrPublicHex
      `)
    )
    .where("amp.split_destination", "=", userId)
    .andWhere("amp.tx_id", "=", paymentId)
    .whereNotNull("amp.tx_id")
    .first();
}

export function getSplitDetail(paymentId) {
  return db
    .knex("amp")
    .join("user", "user.id", "=", "amp.split_destination")
    .select(
      "msat_amount as msatAmount",
      "fee_msat as feeMsat",
      "user.name",
      "user.id as userId"
    )
    .where("tx_id", "=", paymentId)
    .andWhere("tx_id", "=", paymentId);
}

// SUMMARY QUERIES

export function promoEarnings(userId) {
  return db
    .knex("promo_reward")
    .select(
      db.knex.raw(`CAST(max(DATE("created_at")) as text) as "paymentId"`),
      db.knex.raw(`0 as "feeMsat"`),
      db.knex.raw("true as success"),
      db.knex.raw(`'${TransactionType.TOPUP}' as type`),
      db.knex.raw("NULL as title"),
      db.knex.raw(`false as "isPending"`),
      db.knex.raw("NULL as comment"),
      db.knex.raw("NULL as id"),
      db.knex.raw(`sum("msat_amount") as "msatAmount"`),
      db.knex.raw("NULL as failureReason"),
      db.knex.raw(`max("created_at") as "created_at"`),
      db.knex.raw("NULL as zapEvent")
    )
    .where("user_id", "=", userId)
    .andWhere("is_pending", "=", false)
    .andWhere("created_at", ">", getDateFilter())
    .groupBy("user_id", db.knex.raw(`DATE("created_at")`));
}

export function earnings(userId) {
  return db
    .knex("amp")
    .join("preamp", "preamp.tx_id", "=", "amp.tx_id")
    .leftOuterJoin("user", "user.id", "=", "amp.user_id")
    .leftOuterJoin("comment", "comment.tx_id", "=", "amp.tx_id")
    .leftOuterJoin("track", "track.id", "=", "amp.track_id")
    .leftOuterJoin("album", "album.id", "=", "amp.track_id")
    .leftOuterJoin("artist", "artist.id", "=", "amp.track_id")
    .leftOuterJoin("episode", "episode.id", "=", "amp.track_id")
    .leftOuterJoin("podcast", "podcast.id", "=", "amp.track_id")
    .select(
      db.knex.raw('CAST("amp"."tx_id" as text) as paymentid'),
      "amp.fee_msat as feemsat",
      db.knex.raw("true as success"),
      db.knex.raw(`'${TransactionType.EARNINGS}' as type`),
      db.knex.raw(
        'COALESCE("track"."title", "album"."title", "artist"."name", "episode"."title") as title'
      ),
      db.knex.raw("false as ispending"),
      "comment.content as comment",
      "amp.id as id",
      "amp.msat_amount as msatAmount",
      db.knex.raw("'' as failureReason"),
      "amp.created_at as created_at",
      db.knex.raw("NULL as zapEvent")
    )
    .where("amp.split_destination", "=", userId)
    .andWhere("amp.created_at", ">", getDateFilter())
    .whereNotNull("amp.tx_id");
}

export function transactions(userId) {
  return db
    .knex("transaction")
    .leftJoin(
      "zap_request",
      "zap_request.payment_hash",
      db.knex.raw(`CONCAT('transaction-', CAST("transaction"."id" as text))`)
    )
    .select(
      db.knex.raw('CAST("transaction"."id" as text) as paymentid'),
      "transaction.fee_msat as feemsat",
      "transaction.success as success",
      db.knex.raw(
        `CASE WHEN is_lnurl=true THEN '${TransactionType.ZAP}' WHEN withdraw=true THEN '${TransactionType.WITHDRAW}' ELSE '${TransactionType.DEPOSIT}' END AS type`
      ),
      db.knex.raw("'' as title"),
      "transaction.is_pending as ispending",
      "transaction.lnurl_comment as comment",
      "transaction.id as id",
      "transaction.msat_amount as msatAmount",
      "transaction.failure_reason as failureReason",
      "transaction.created_at as created_at",
      "zap_request.event as zapEvent"
    )
    .where("transaction.user_id", "=", userId)
    .andWhere("transaction.created_at", ">", getDateFilter())
    .as("transactions");
}

export function nwcTransactions(userId) {
  return db
    .knex("nwc_wallet_transaction")
    .join(
      "wallet_connection",
      "nwc_wallet_transaction.pubkey",
      "=",
      "wallet_connection.pubkey"
    )
    .join("user", "user.id", "=", "wallet_connection.user_id")
    .select(
      db.knex.raw('CAST("nwc_wallet_transaction"."id" as text) as paymentid'),
      db.knex.raw("0 as feeMsat"),
      db.knex.raw("true as success"),
      db.knex.raw(`'${TransactionType.ZAP_SEND}' as type`),
      db.knex.raw("'NWC' as title"),
      db.knex.raw("false as ispending"),
      db.knex.raw("'' as comment"),
      "nwc_wallet_transaction.id as id",
      "nwc_wallet_transaction.msat_amount as msatAmount",
      db.knex.raw("'' as failureReason"),
      "nwc_wallet_transaction.created_at as created_at",
      db.knex.raw("NULL as zapEvent")
    )
    .where("wallet_connection.user_id", "=", userId)
    .andWhere("nwc_wallet_transaction.created_at", ">", getDateFilter());
}

export function forwards(userId) {
  return db
    .knex("forward_detail")
    .join(
      "forward",
      "forward.external_payment_id",
      "=",
      "forward_detail.external_payment_id"
    )
    .select(
      db.knex.raw(
        'CAST("forward_detail"."external_payment_id" as text) as paymentid'
      ),
      db.knex.raw("0 as feeMsat"),
      db.knex.raw("bool_and(forward_detail.success) as success"),
      db.knex.raw(`'${TransactionType.AUTOFORWARD}' as type`),
      db.knex.raw("'' as title"),
      db.knex.raw("false as ispending"),
      db.knex.raw("'' as comment"),
      db.knex.raw("min(forward_detail.id) as id"),
      db.knex.raw("min(forward_detail.msat_amount) as msatAmount"),
      db.knex.raw("min(forward_detail.error) as failureReason"),
      db.knex.raw("min(forward_detail.created_at) as created_at"),
      db.knex.raw("NULL as zapEvent")
    )
    .where("forward.user_id", "=", userId)
    .andWhere("forward_detail.created_at", ">", getDateFilter())
    .groupBy("forward_detail.external_payment_id", "forward_detail.created_at");
}

export function internalAmps(userId) {
  return db
    .knex("preamp")
    .join("amp", "amp.tx_id", "=", "preamp.tx_id")
    .leftOuterJoin("track", "track.id", "=", "preamp.content_id")
    .leftOuterJoin("album", "album.id", "=", "preamp.content_id")
    .leftOuterJoin("artist", "artist.id", "=", "preamp.content_id")
    .leftOuterJoin("episode", "episode.id", "=", "preamp.content_id")
    .leftOuterJoin("podcast", "podcast.id", "=", "preamp.content_id")
    .select(
      db.knex.raw('CAST("preamp"."tx_id" as text) as paymentid'),
      db.knex.raw("0 as feeMsat"),
      db.knex.raw("true as success"),
      db.knex.raw(`'${TransactionType.ZAP_SEND}' as type`),
      db.knex.raw(
        'MIN(COALESCE("track"."title", "album"."title", "artist"."name", "episode"."title")) as title'
      ),
      db.knex.raw("false as ispending"),
      db.knex.raw("'' as comment"),
      db.knex.raw("MIN(amp.id) as id"),
      "preamp.msat_amount as msatAmount",
      db.knex.raw("'' as failureReason"),
      "preamp.created_at as created_at",
      db.knex.raw("NULL as zapEvent")
    )
    .groupBy("preamp.tx_id")
    .where("preamp.user_id", "=", userId)
    .andWhere("preamp.created_at", ">", getDateFilter())
    .whereNotNull("preamp.created_at");
}

export function externalAmps(userId) {
  return db
    .knex("external_payment")
    .select(
      db.knex.raw('CAST("external_payment"."tx_id" as text) as paymentid'),
      "external_payment.fee_msat as feemsat",
      "external_payment.is_settled as success",
      db.knex.raw(`'${TransactionType.ZAP_SEND}' as type`),
      "external_payment.podcast as title",
      "external_payment.is_pending as ispending",
      db.knex.raw("'' as comment"),
      "external_payment.id as id",
      "external_payment.msat_amount as msatAmount",
      db.knex.raw("'' as failureReason"),
      "external_payment.created_at as created_at",
      db.knex.raw("NULL as zapEvent")
    )
    .where("external_payment.user_id", "=", userId)
    .andWhere("external_payment.created_at", ">", getDateFilter())
    .andWhere("external_payment.is_settled", "=", true);
}

export function pendingForwards(userId) {
  return db
    .knex("forward")
    .select(
      db.knex.raw("'pending' as paymentid"),
      db.knex.raw("0 as feemsat"),
      db.knex.raw("false as success"),
      db.knex.raw(`'${TransactionType.AUTOFORWARD}' as type`),
      db.knex.raw("'' as title"),
      db.knex.raw("true as ispending"),
      db.knex.raw("'' as comment"),
      db.knex.raw("max(forward.id) as id"),
      db.knex.raw("sum(forward.msat_amount) as msatAmount"),
      db.knex.raw("'' as failureReason"),
      db.knex.raw("max(forward.created_at) as created_at"),
      db.knex.raw("NULL as zapEvent")
    )
    .where("forward.user_id", "=", userId)
    .andWhere("forward.in_flight", "=", false)
    .andWhere("forward.is_settled", "=", false)
    .groupBy("forward.user_id");
}

export function getMaxTransactionDate(userId) {
  return db
    .knex("transaction")
    .max("updated_at as created_at")
    .where("user_id", "=", userId);
}

export function getMaxAmpDate(userId) {
  return db
    .knex("amp")
    .max("created_at as created_at")
    .where("split_destination", "=", userId);
}

export function getTicketPayments(userId) {
  return db
    .knex("ticket")
    .join(
      "ticketed_event",
      "ticketed_event.id",
      "=",
      "ticket.ticketed_event_id"
    )
    .where("ticketed_event.user_id", "=", userId)
    .andWhere("ticket.is_paid", "=", true)
    .select(
      db.knex.raw("CAST(ticket.id as text) as paymentid"),
      db.knex.raw("0 as feemsat"),
      db.knex.raw("ticket.is_paid as success"),
      db.knex.raw(`'${TransactionType.TICKET}' as type`),
      db.knex.raw("ticketed_event.name as title"),
      db.knex.raw("ticket.is_pending as ispending"),
      db.knex.raw(
        "CONCAT(ticketed_event.name, ' - ticket id: ', ticket.id) as comment"
      ),
      db.knex.raw("ticket.id as id"),
      db.knex.raw("ticket.price_msat as msatAmount"),
      db.knex.raw("'' as failureReason"),
      db.knex.raw("ticket.created_at as created_at"),
      db.knex.raw("NULL as zapEvent")
    );
}

export function getTicketDetail(userId, id) {
  return db
    .knex("ticket")
    .join(
      "ticketed_event",
      "ticketed_event.id",
      "=",
      "ticket.ticketed_event_id"
    )
    .where("ticketed_event.user_id", "=", userId)
    .andWhere("ticket.id", "=", id)
    .select(
      db.knex.raw("CAST(ticket.id as text) as paymentid"),
      db.knex.raw("0 as feemsat"),
      db.knex.raw("ticket.is_paid as success"),
      db.knex.raw(`'${TransactionType.TICKET}' as type`),
      db.knex.raw("ticketed_event.name as title"),
      db.knex.raw("ticket.is_pending as ispending"),
      db.knex.raw(
        "CONCAT(ticketed_event.name, ' - ticket id: ', ticket.id) as comment"
      ),
      db.knex.raw("ticket.id as id"),
      db.knex.raw("ticket.price_msat as msatAmount"),
      db.knex.raw("'' as failureReason"),
      db.knex.raw("ticket.created_at as created_at"),
      db.knex.raw("NULL as zapEvent")
    )
    .first();
}

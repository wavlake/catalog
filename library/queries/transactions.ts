import db from "../db";

// QUERY FUNCTIONS

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
      db.knex.raw("'Earnings' as type"),
      db.knex.raw(
        'COALESCE("track"."title", "album"."title", "artist"."name", "episode"."title") as title'
      ),
      db.knex.raw("false as ispending"),
      "comment.content as comment",
      "amp.id as id",
      "amp.msat_amount as msatAmount",
      db.knex.raw("'' as failureReason"),
      "amp.created_at as createDate"
      //   "amp.track_id as contentId",
      //   "amp.type as ampType",
      //   "preamp.msat_amount as totalMsatAmount",
      //   "preamp.podcast as podcast",
      //   "preamp.episode as episode",
      //   "preamp.app_name as appName",
      //   "user.artwork_url as commenterArtworkUrl",
      //   db.knex.raw(
      //     `COALESCE("artist"."artist_url", "podcast"."podcast_url") as "contentUrl"`
      //   ),
      //   db.knex.raw('COALESCE("user"."name", "preamp"."sender_name") as name'),
    )
    .where("amp.split_destination", "=", userId)
    .whereNotNull("amp.tx_id");
}

export function transactions(userId) {
  return db
    .knex("transaction")
    .select(
      db.knex.raw('CAST("transaction"."id" as text) as paymentid'),
      "transaction.fee_msat as feemsat",
      "transaction.success as success",
      db.knex.raw(
        "CASE WHEN is_lnurl=true THEN 'Zap' WHEN withdraw=true THEN 'Withdraw' ELSE 'Deposit' END AS type"
      ),
      db.knex.raw("'' as title"),
      "transaction.is_pending as ispending",
      "transaction.lnurl_comment as comment",
      "transaction.id as id",
      "transaction.msat_amount as msatAmount",
      "transaction.failure_reason as failureReason",
      "transaction.created_at as createDate"
    )
    .where("transaction.user_id", "=", userId)
    .as("transactions");
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
      db.knex.raw("'Autoforward' as type"),
      db.knex.raw("'' as title"),
      db.knex.raw("false as ispending"),
      db.knex.raw("'' as comment")
    )
    .min("forward_detail.id as id")
    .min("forward_detail.msat_amount as msatAmount")
    .min("forward_detail.error as failureReason")
    .min("forward_detail.created_at as createDate")
    .groupBy("forward_detail.external_payment_id", "forward_detail.created_at")
    .where("forward.user_id", "=", userId);
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
      db.knex.raw("'Zap Sent' as type"),
      db.knex.raw(
        'COALESCE("track"."title", "album"."title", "artist"."name", "episode"."title") as title'
      ),
      db.knex.raw("false as ispending"),
      db.knex.raw("'' as comment"),
      db.knex.raw("amp.id as id"),
      "preamp.msat_amount as msatAmount",
      db.knex.raw("'' as failureReason"),
      "preamp.created_at as createDate"
    )
    .where("preamp.user_id", "=", userId)
    .whereNotNull("preamp.created_at");
}

export function externalAmps(userId) {
  return db
    .knex("external_payment")
    .select(
      db.knex.raw('CAST("external_payment"."tx_id" as text) as paymentid'),
      "external_payment.fee_msat as feemsat",
      "external_payment.is_settled as success",
      db.knex.raw("'Zap Sent' as type"),
      "external_payment.podcast as title",
      "external_payment.is_pending as ispending",
      db.knex.raw("'' as comment"),
      "external_payment.id as id",
      "external_payment.msat_amount as msatAmount",
      db.knex.raw("'' as failureReason"),
      "external_payment.created_at as createDate"
    )
    .where("external_payment.user_id", "=", userId)
    .andWhere("external_payment.is_settled", "=", true);
}

export function pendingForwards(userId) {
  return db
    .knex("forward")
    .select(
      db.knex.raw("'pending' as paymentid"),
      db.knex.raw("0 as feemsat"),
      db.knex.raw("false as success"),
      db.knex.raw("'Autoforward' as type"),
      db.knex.raw("'' as title"),
      db.knex.raw("true as ispending"),
      db.knex.raw("'' as comment"),
      db.knex.raw("max(forward.id) as id"),
      db.knex.raw("sum(forward.msat_amount) as msatAmount"),
      db.knex.raw("'' as failureReason"),
      db.knex.raw("max(forward.created_at) as createDate")
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
    .where("split_destination", "=", userId)
    .as("max_amp_date");
}

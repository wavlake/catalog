import db from "../library/db";
import log from "loglevel";

export const getAllComments = async (
  contentIds: string[],
  limit: number,
  offset: number = 0
) => {
  const allComments = await db
    .knex(commentsLegacy(contentIds))
    .unionAll([commentsV2(contentIds)])
    .orderBy("createdAt", "desc")
    .limit(limit)
    .offset(offset)
    .catch((e) => {
      log.error(e);
    });

  console.log(allComments);
  return allComments;
};

// Subquery defintions

function commentsLegacy(contentIds) {
  return db
    .knex("comment")
    .leftOuterJoin("user", "comment.user_id", "=", "user.id")
    .join("amp", "comment.amp_id", "=", "amp.id")
    .join("track", "track.id", "=", "amp.track_id")
    .leftOuterJoin(amps, "comment.id", "=", "amps.type_key")
    .leftOuterJoin(reply, "comment.id", "=", "reply.parentId")
    .select(
      "comment.id as id",
      db.knex.raw("JSON_AGG(DISTINCT reply) as replies"), // Thank you SO: https://stackoverflow.com/questions/48394387/how-to-group-row-into-an-array-postgresql
      db.knex.raw(`bool_or(is_nostr) as "isNostr"`),
      "track.id as contentId"
    )
    .min("amp.msat_amount as msatAmount")
    .min("comment.user_id as userId")
    .min("comment.created_at as createdAt")
    .min("comment.content as content")
    .min("user.artwork_url as commenterArtworkUrl")
    .min("user.name as name")
    .min("track.title as title")
    .whereIn("track.id", contentIds)
    .andWhere("amp.comment", "=", true)
    .whereNull("comment.parent_id")
    .whereNull("amp.tx_id")
    .groupBy("comment.id", "track.id")
    .as("commentsLegacy");
}

function commentsV2(contentIds) {
  return db.knex.raw(`
  SELECT 
  "comment"."id" AS "id",
  '[]' AS "replies",
  "comment"."is_nostr" AS "isNostr",
  "preamp"."content_id" AS "contentId",
  "preamp"."msat_amount" AS "msatAmount",
  "preamp"."user_id" AS "userId",
  "comment"."created_at" AS "createdAt",
  "comment"."content" AS "content",
  COALESCE("user"."artwork_url", JSONB_EXTRACT_PATH_TEXT("npub"."metadata", '$.picture')::text) AS "commenterArtworkUrl",
  COALESCE("user"."name", JSONB_EXTRACT_PATH_TEXT("npub"."metadata", '$.display_name')::text, "preamp"."sender_name") AS "name",
  COALESCE("track"."title", "episode"."title") AS "title"
  FROM
    "preamp"
  JOIN
    "comment" ON "comment"."tx_id" = "preamp"."tx_id"
  LEFT JOIN
    "track" ON "track"."id" = "preamp"."content_id"
  LEFT JOIN
    "episode" ON "episode"."id" = "preamp"."content_id"
  LEFT JOIN
    "user" ON "user"."id" = "preamp"."user_id"
  LEFT JOIN
    "npub" ON "npub"."public_hex" = "preamp"."user_id"
  WHERE
    "preamp"."content_id" IN (${contentIds.map((id) => `'${id}'`).join(", ")})
`);
}

// REPLY QUERIES FROM LEGACY

const amps = db
  .knex("amp")
  .select("type_key")
  .sum("amp.msat_amount as msatAmount")
  .groupBy("type_key")
  .where("type", "=", 4)
  .from("amp")
  .as("amps");

const reply_amps = db
  .knex("amp")
  .select("type_key")
  .min("type as type")
  .sum("amp.msat_amount as msatAmount")
  .groupBy("type_key")
  .where("type", "=", 3)
  .orWhere("type", "=", 4)
  .from("amp")
  .as("reply_amps");

const reply = db.knex
  .select("comment.id")
  .min("user.name as name")
  .min("comment.user_id as userId")
  .min("user.artwork_url as artworkUrl")
  .min("user.profile_url as profileUrl")
  .min("parent_id as parentId")
  .min("content as content")
  .min("comment.created_at as createdAt")
  .sum("reply_amps.msatAmount as msatAmount")
  .join("user", "comment.user_id", "=", "user.id")
  .leftOuterJoin(reply_amps, "comment.id", "=", "reply_amps.type_key")
  .groupBy("comment.id")
  .from("comment")
  .orderBy("comment.created_at")
  .as("reply");

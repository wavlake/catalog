import db from "../library/db";
import { nip19 } from "nostr-tools";
import log from "loglevel";

export const getAllComments = async (
  contentIds: string[],
  limit: number,
  offset: number = 0
) => {
  const allComments = await db
    .knex(commentsLegacy(contentIds))
    .unionAll([nostrComments(contentIds)])
    .orderBy("createdAt", "desc")
    .limit(limit)
    .offset(offset);

  return allComments;
};

// Subquery defintions

function commentsLegacy(contentIds) {
  return db
    .knex("comment")
    .leftOuterJoin("user", "comment.user_id", "=", "user.id")
    .join("amp", "comment.amp_id", "=", "amp.id")
    .join("track", "track.id", "=", "amp.track_id")
    .select(
      "comment.id as id",
      "is_nostr as isNostr",
      "track.id as contentId",
      "amp.msat_amount as msatAmount",
      "comment.user_id as userId",
      "comment.created_at as createdAt",
      "comment.content as content",
      "user.artwork_url as commenterArtworkUrl",
      "user.name as name",
      "track.title as title"
    )
    .whereIn("track.id", contentIds)
    .andWhere("amp.comment", "=", true)
    .andWhere("track.deleted", "=", false)
    .whereNull("comment.parent_id")
    .whereNull("amp.tx_id")
    .as("commentsLegacy");
}

function nostrComments(contentIds) {
  return db.knex.raw(`
  SELECT 
  "comment"."id" AS "id",
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

import db from "../library/db";
import log from "./winston";

const BAD_COMMENTS = ["Zapped by", "TrueFans Stream"];

export const getAllComments = async (
  contentIds: string[],
  limit: number,
  offset: number = 0
) => {
  if (!contentIds.length) return [];

  const allComments = await db
    .knex(commentsLegacy(contentIds))
    .unionAll([commentsV2(contentIds)])
    .orderBy("createdAt", "desc")
    .limit(limit)
    .offset(offset)
    .catch((e) => {
      log.error(e);
    });

  // Replace boilerplate comments null object
  if (Array.isArray(allComments) && allComments.length) {
    allComments.forEach((comment) => {
      if (BAD_COMMENTS.some((bad) => comment.content.includes(bad))) {
        delete comment.content;
      }
    });
  }

  // Replace parent_id with parentId in replies
  if (Array.isArray(allComments) && allComments.length) {
    allComments.forEach((comment) => {
      if (comment.replies) {
        comment.replies = comment.replies
          // Remove null values
          .filter((x) => (!x ? false : true))
          // Replace parent_id with parentId
          .map((reply) => {
            if (!reply) {
              return;
            }
            if (!reply.parentId) {
              return reply;
            }
            reply.parentId = reply.parent_id;
            delete reply.parent_id;
            return reply;
          });
      }
    });
  }

  return allComments;
};

export const getCommentById = async (commentId: number) => {
  return db
    .knex(commentLegacyById(commentId))
    .unionAll([commentV2ById(commentId)])
    .first();
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
    .min("comment.event_id as eventId")
    .min("comment.zap_event_id as zapEventId")
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
  COALESCE(JSON_AGG(DISTINCT reply) FILTER (WHERE reply.parent_id IS NOT NULL), '[]') AS "replies",
  "comment"."is_nostr" AS "isNostr",
  "preamp"."content_id" AS "contentId",
  "preamp"."msat_amount" AS "msatAmount",
  "preamp"."user_id" AS "userId",
  "comment"."created_at" AS "createdAt",
  "comment"."content" AS "content",
  "comment"."event_id" AS "eventId",
  "comment"."zap_event_id" AS "zapEventId",
  COALESCE("user"."artwork_url", JSONB_EXTRACT_PATH_TEXT("npub"."metadata", 'picture')::text) AS "commenterArtworkUrl",
  COALESCE("user"."name", JSONB_EXTRACT_PATH_TEXT("npub"."metadata", 'display_name')::text, JSONB_EXTRACT_PATH_TEXT("npub"."metadata", 'name')::text, "preamp"."sender_name") AS "name",
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
  LEFT OUTER JOIN
    (SELECT "comment"."id" AS "id",
            "comment"."parent_id" AS "parent_id",
            "comment"."content" AS "content",
            "comment"."created_at" AS "createdAt",
            "comment"."user_id" AS "userId",
            COALESCE(JSONB_EXTRACT_PATH_TEXT("npub"."metadata", 'picture')::text) AS "commenterArtworkUrl",
            COALESCE(JSONB_EXTRACT_PATH_TEXT("npub"."metadata", 'display_name')::text, JSONB_EXTRACT_PATH_TEXT("npub"."metadata", 'name')::text) AS "name",
            "comment"."is_nostr" AS "isNostr"
            FROM "comment"
            LEFT OUTER JOIN "npub" ON "npub"."public_hex" = "comment"."user_id"
            ) AS "reply" ON "comment"."id" = "reply"."parent_id"
  WHERE
    "preamp"."content_id" IN (${contentIds.map((id) => `'${id}'`).join(", ")})
  GROUP BY
    "comment"."id",
    "comment"."is_nostr",
    "preamp"."content_id",
    "preamp"."msat_amount",
    "preamp"."user_id",
    "comment"."created_at",
    "comment"."content",
    "comment"."event_id",
    "comment"."zap_event_id",
    "user"."artwork_url",
    "user"."name",
    "track"."title",
    "episode"."title",
    "npub"."metadata",
    "preamp"."sender_name"
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

const reply = db.knex
  .select(
    "comment.id",
    db.knex.raw(
      `COALESCE("user"."name", JSONB_EXTRACT_PATH_TEXT("npub"."metadata", 'display_name')::text, JSONB_EXTRACT_PATH_TEXT("npub"."metadata", 'name')::text) AS "name"`
    ),
    "comment.user_id as userId",
    db.knex.raw(
      `COALESCE("user"."artwork_url", JSONB_EXTRACT_PATH_TEXT("npub"."metadata", 'picture')::text) as "artworkUrl"`
    ),
    "parent_id as parentId",
    "content as content",
    "comment.created_at as createdAt",
    "is_nostr as isNostr"
  )
  .leftOuterJoin("user", "comment.user_id", "=", "user.id")
  .leftOuterJoin("npub", "npub.public_hex", "=", "comment.user_id")
  .from("comment")
  .orderBy("comment.created_at")
  .as("reply");

function commentLegacyById(commentId) {
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
    .min("comment.event_id as eventId")
    .min("comment.zap_event_id as zapEventId")
    .min("user.artwork_url as commenterArtworkUrl")
    .min("user.name as name")
    .min("track.title as title")
    .where("comment.id", commentId)
    .andWhere("amp.comment", "=", true)
    .whereNull("comment.parent_id")
    .whereNull("amp.tx_id")
    .groupBy("comment.id", "track.id")
    .as("commentsLegacy");
}

function commentV2ById(commentId) {
  return db.knex.raw(`
    SELECT 
    "comment"."id" AS "id",
    COALESCE(JSON_AGG(DISTINCT reply) FILTER (WHERE reply.parent_id IS NOT NULL), '[]') AS "replies",
    "comment"."is_nostr" AS "isNostr",
    "preamp"."content_id" AS "contentId",
    "preamp"."msat_amount" AS "msatAmount",
    "preamp"."user_id" AS "userId",
    "comment"."created_at" AS "createdAt",
    "comment"."content" AS "content",
    "comment"."event_id" AS "eventId",
    "comment"."zap_event_id" AS "zapEventId",
    COALESCE("user"."artwork_url", JSONB_EXTRACT_PATH_TEXT("npub"."metadata", 'picture')::text) AS "commenterArtworkUrl",
    COALESCE("user"."name", JSONB_EXTRACT_PATH_TEXT("npub"."metadata", 'display_name')::text, JSONB_EXTRACT_PATH_TEXT("npub"."metadata", 'name')::text, "preamp"."sender_name") AS "name",
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
    LEFT OUTER JOIN
      (SELECT "comment"."id" AS "id",
              "comment"."parent_id" AS "parent_id",
              "comment"."content" AS "content",
              "comment"."created_at" AS "createdAt",
              "comment"."user_id" AS "userId",
              COALESCE(JSONB_EXTRACT_PATH_TEXT("npub"."metadata", 'picture')::text) AS "commenterArtworkUrl",
              COALESCE(JSONB_EXTRACT_PATH_TEXT("npub"."metadata", 'display_name')::text, JSONB_EXTRACT_PATH_TEXT("npub"."metadata", 'name')::text) AS "name",
              "comment"."is_nostr" AS "isNostr"
              FROM "comment"
              LEFT OUTER JOIN "npub" ON "npub"."public_hex" = "comment"."user_id"
              ) AS "reply" ON "comment"."id" = "reply"."parent_id"
    WHERE
      "comment"."id" = ${commentId}
    GROUP BY
      "comment"."id",
      "comment"."is_nostr",
      "preamp"."content_id",
      "preamp"."msat_amount",
      "preamp"."user_id",
      "comment"."created_at",
      "comment"."content",
      "comment"."event_id",
      "comment"."zap_event_id",
      "user"."artwork_url",
      "user"."name",
      "track"."title",
      "episode"."title",
      "npub"."metadata",
      "preamp"."sender_name"
  `);
}

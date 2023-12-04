import prisma from "../prisma/client";
import db from "../library/db";
import { nip19 } from "nostr-tools";

export const getAllComments = async (contentIds: string[], limit: number) => {
  const allComments = await db
    .knex(commentsLegacy(contentIds))
    .unionAll([
      nostrComments(contentIds),
      userComments(contentIds),
      userCommentsViaKeysend(contentIds),
    ])
    .orderBy("createdAt", "desc")
    .limit(limit);

  const commentsWithSatAmount = await Promise.all(
    allComments.map(async (comment) => {
      comment.msatAmount = comment.commentMsatSum;
      return {
        ...comment,
      };
    })
  );

  const commentsWithNames = await Promise.all(
    commentsWithSatAmount.map(async (comment) => {
      if (comment.isNostr) {
        const npub = nip19.npubEncode(comment.userId);
        comment.userId = null;
        comment.name = npub.slice(0, 5) + "..." + npub.slice(-5);

        return {
          ...comment,
        };
      } else {
        // Clean up names from other apps with @ prefix
        comment.name = comment.name.replace("@", "");
        return {
          ...comment,
        };
      }
    })
  );

  return commentsWithNames;
};

// Subquery defintions

function commentsLegacy(contentIds) {
  return db
    .knex("comment")
    .leftOuterJoin("user", "comment.user_id", "=", "user.id")
    .join("amp", "comment.amp_id", "=", "amp.id")
    .join("track", "track.id", "=", "amp.track_id")
    .join("artist", "artist.id", "=", "track.artist_id")
    .select(
      "comment.id as id",
      "track.id as trackId",
      "is_nostr as isNostr",
      "amp.tx_id as txId"
    )
    .min("track.title as title")
    .min("artist.user_id as ownerId")
    .min("comment.content as content")
    .min("comment.created_at as createdAt")
    .min("amp.msat_amount as commentMsatSum")
    .min("comment.user_id as userId")
    .min("user.name as name")
    .min("user.profile_url as commenterProfileUrl")
    .min("user.artwork_url as commenterArtworkUrl")
    .whereIn("track.id", contentIds)
    .andWhere("amp.comment", "=", true)
    .andWhere("track.deleted", "=", false)
    .whereNull("comment.parent_id")
    .whereNull("amp.tx_id")
    .groupBy("comment.id", "track.id", "amp.tx_id")
    .as("commentsLegacy");
}

function nostrComments(contentIds) {
  return db
    .knex("comment")
    .leftOuterJoin("user", "comment.user_id", "=", "user.id")
    .join("preamp", "comment.tx_id", "=", "preamp.tx_id")
    .join("track", "track.id", "=", "comment.content_id")
    .join("artist", "artist.id", "=", "track.artist_id")
    .select(
      "comment.id as id",
      "track.id as trackId",
      "is_nostr as isNostr",
      "preamp.tx_id as txId"
    )
    .min("track.title as title")
    .min("artist.user_id as ownerId")
    .min("comment.content as content")
    .min("comment.created_at as createdAt")
    .min("preamp.msat_amount as commentMsatSum")
    .min("comment.user_id as userId")
    .min("comment.user_id as name") // TODO: get username via nostr profile
    .min("user.profile_url as commenterProfileUrl")
    .min("user.artwork_url as commenterArtworkUrl")
    .whereIn("track.id", contentIds)
    .andWhere("comment.is_nostr", "=", true)
    .whereNull("comment.parent_id")
    .groupBy("comment.id", "track.id", "preamp.tx_id");
}

function userComments(contentIds) {
  return db
    .knex("comment")
    .leftOuterJoin("user", "comment.user_id", "=", "user.id")
    .join("preamp", "comment.tx_id", "=", "preamp.tx_id")
    .join("track", "track.id", "=", "comment.content_id")
    .join("artist", "artist.id", "=", "track.artist_id")
    .select(
      "comment.id as id",
      "track.id as trackId",
      "is_nostr as isNostr",
      "preamp.tx_id as txId"
    )
    .min("track.title as title")
    .min("artist.user_id as ownerId")
    .min("comment.content as content")
    .min("comment.created_at as createdAt")
    .min("preamp.msat_amount as commentMsatSum")
    .min("comment.user_id as userId")
    .min("user.name as name")
    .min("user.profile_url as commenterProfileUrl")
    .min("user.artwork_url as commenterArtworkUrl")
    .whereIn("track.id", contentIds)
    .whereNotNull("comment.tx_id")
    .andWhere("track.deleted", "=", false)
    .andWhere("comment.is_nostr", "=", false)
    .andWhere("comment.user_id", "!=", "keysend")
    .whereNull("comment.parent_id")
    .groupBy("comment.id", "track.id", "preamp.tx_id");
}

function userCommentsViaKeysend(contentIds) {
  return db
    .knex("comment")
    .leftOuterJoin("user", "comment.user_id", "=", "user.id")
    .join("preamp", "comment.tx_id", "=", "preamp.tx_id")
    .join("track", "track.id", "=", "comment.content_id")
    .join("artist", "artist.id", "=", "track.artist_id")
    .select(
      "comment.id as id",
      "track.id as trackId",
      "is_nostr as isNostr",
      "preamp.tx_id as txId"
    )
    .min("track.title as title")
    .min("artist.user_id as ownerId")
    .min("comment.content as content")
    .min("comment.created_at as createdAt")
    .min("preamp.msat_amount as commentMsatSum")
    .min("comment.user_id as userId")
    .min("preamp.sender_name as name")
    .min("user.profile_url as commenterProfileUrl")
    .min("user.artwork_url as commenterArtworkUrl")
    .whereIn("track.id", contentIds)
    .whereNotNull("comment.tx_id")
    .andWhere("track.deleted", "=", false)
    .andWhere("comment.is_nostr", "=", false)
    .andWhere("comment.user_id", "=", "keysend")
    .whereNull("comment.parent_id")
    .groupBy("comment.id", "track.id", "preamp.tx_id");
}
import prisma from "../prisma/client";
import db from "../library/db";
import { nip19 } from "nostr-tools";

export const getAllComments = async (
  contentIds: string[],
  limit: number,
  offset: number = 0
) => {
  const allComments = await db
    // .knex(commentsLegacy(contentIds))
    // .unionAll([
    .knex(nostrComments(contentIds))
    // userComments(contentIds),
    // userCommentsViaKeysend(contentIds),
    // ])
    .orderBy("createdAt", "desc")
    .limit(limit)
    .offset(offset);

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
        const commenterProfileUrl = `https://primal.net/p/${npub}`;
        return { ...comment, commenterProfileUrl };
      } else {
        // Clean up names from other apps with @ prefix
        comment.name = comment.name?.replace("@", "") ?? "anonymous";
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
    .join("npub", "npub.public_hex", "=", "comment.user_id")
    .select(
      "comment.id as id",
      "track.id as trackId",
      "is_nostr as isNostr",
      "preamp.tx_id as txId",
      "track.title as title",
      "artist.user_id as ownerId",
      "comment.content as content",
      "comment.created_at as createdAt",
      "preamp.msat_amount as commentMsatSum",
      "comment.user_id as userId",
      // this is set above based on the npub
      "comment.user_id as commenterProfileUrl"
    )
    .jsonExtract("npub.metadata", "$.display_name", "name")
    .jsonExtract("npub.metadata", "$.picture", "commenterArtworkUrl")
    .whereIn("track.id", contentIds)
    .andWhere("comment.is_nostr", "=", true)
    .whereNull("comment.parent_id")
    .as("nostrComments");
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

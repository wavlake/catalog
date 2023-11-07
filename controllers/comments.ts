import { formatError } from "../library/errors";
import prisma from "../prisma/client";
import asyncHandler from "express-async-handler";
import { getAllComments } from "../library/comments";
import db from "../library/db";

const get_comments = asyncHandler(async (req, res, next) => {
  const { id: contentId } = req.params;
  if (!contentId) {
    const error = formatError(400, "Must include a track or episode id");
    next(error);
    return;
  }

  const combinedAndSortedComments = await getAllComments([contentId]);

  res.json({
    success: true,
    data: combinedAndSortedComments,
  });
});

// looks up all episode ids for a podcast and then gets all comments for those episodes
const get_podcast_comments = asyncHandler(async (req, res, next) => {
  const { id: podcastId } = req.params;
  if (!podcastId) {
    const error = formatError(400, "Must include the podcast id");
    next(error);
    return;
  }

  const episodes = await prisma.episode.findMany({
    where: { podcastId },
  });

  const combinedAndSortedComments = await getAllComments(
    episodes.map(({ id }) => id)
  );

  res.json({ success: true, data: combinedAndSortedComments });
});

// looks up all album ids for an artist, then all the track ids for each album,
// and then gets all comments for those tracks
const get_artist_comments = asyncHandler(async (req, res, next) => {
  const { id: artistId } = req.params;
  if (!artistId) {
    const error = formatError(400, "Must include the artist id");
    next(error);
    return;
  }

  const albums = await prisma.album.findMany({
    where: { artistId },
  });

  const tracks = await prisma.track.findMany({
    where: {
      OR: albums.map(({ id }) => ({
        albumId: id,
      })),
    },
  });

  const comments = await getAllComments(tracks.map(({ id }) => id));

  const commentsLegacy = await db
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
    .where("artist.id", "=", artistId)
    .andWhere("amp.comment", "=", true)
    .andWhere("track.deleted", "=", false)
    .whereNull("comment.parent_id")
    .groupBy("comment.id", "track.id", "amp.tx_id")
    .orderBy("createdAt", "desc");

  // TODO: Pagination
  res.json({ success: true, data: [...comments, ...commentsLegacy] });
});

export default {
  get_comments,
  get_podcast_comments,
  get_artist_comments,
};

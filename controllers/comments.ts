import prisma from "../prisma/client";
import asyncHandler from "express-async-handler";
import { getAllComments } from "../library/comments";
import { formatError } from "../library/errors";
import { Event } from "nostr-tools";

const getCommentsCommon = async (ids, res, next) => {
  const comments = await getAllComments(ids, 100);
  if (!comments) {
    next(formatError(500, "Something went wrong"));
    return;
  }
  res.json({ success: true, data: comments });
};

const get_comments = asyncHandler(async (req, res, next) => {
  await getCommentsCommon([req.params.contentId], res, next);
});

const get_podcast_comments = asyncHandler(async (req, res, next) => {
  const episodes = await prisma.episode.findMany({
    where: { podcastId: req.params.podcastId },
  });

  const episodeIds = episodes.map(({ id }) => id);
  await getCommentsCommon(episodeIds, res, next);
});

const get_artist_comments = asyncHandler(async (req, res, next) => {
  const tracks = await prisma.trackInfo.findMany({
    where: { artistId: req.params.artistId },
  });

  const trackIds = tracks.map(({ id }) => id);
  await getCommentsCommon(trackIds, res, next);
});

const get_album_comments = asyncHandler(async (req, res, next) => {
  const tracks = await prisma.trackInfo.findMany({
    where: { albumId: req.params.albumId },
  });

  const trackIds = tracks.map(({ id }) => id);
  await getCommentsCommon(trackIds, res, next);
});

const get_comment_by_id = asyncHandler(async (req, res, next) => {
  const commentId = req.params.commentId;
  const commentIdInt = parseInt(commentId);

  if (isNaN(commentIdInt)) {
    res.json({ success: false, error: "Invalid comment ID" });
    return;
  }

  const comment = await prisma.comment.findUnique({
    where: { id: commentIdInt },
  });

  if (!comment) {
    res.json({ success: false, error: "Comment not found" });
    return;
  }

  res.json({ success: true, data: comment });
});

const save_event_id = asyncHandler(async (req, res, next) => {
  const pubkey = (res.locals?.authEvent as Event)?.pubkey;
  const commentId = req.params.commentId;
  const eventId = req.params.eventId;
  const commentIdInt = parseInt(commentId);

  if (isNaN(commentIdInt)) {
    res.json({ success: false, error: "Invalid comment ID" });
    return;
  }

  const comment = await prisma.comment.findUnique({
    where: { id: commentIdInt },
  });

  if (!comment) {
    res.json({ success: false, error: "Comment not found" });
    return;
  }

  if (pubkey !== comment.userId) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const updatedComment = await prisma.comment.update({
    where: { id: commentIdInt },
    data: {
      eventId,
    },
  });

  res.json({ success: true });
});

export default {
  get_comments,
  get_podcast_comments,
  get_artist_comments,
  get_album_comments,
  get_comment_by_id,
  save_event_id,
};

import prisma from "../prisma/client";
import db from "../library/db";
const log = require("loglevel");
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

const update_event_id = asyncHandler(async (req, res, next) => {
  const pubkey = (res.locals?.authEvent as Event)?.pubkey;
  const zapRequestEventId = req.params.zapRequestEventId;
  const kind1EventId = req.params.kind1EventId;

  if (!zapRequestEventId || !kind1EventId) {
    res.status(400).json({
      success: false,
      error: "zapRequestEventId and kind1EventId are required",
    });
  }

  const zapRequest = await db
    .knex("zap_request")
    .select(
      db.knex.raw(
        "split_part(payment_hash, '-', 2)::int as external_receive_id"
      ),
      "event_id"
    )
    .where("event_id", "=", zapRequestEventId)
    .first();

  if (!zapRequest || isNaN(zapRequest.external_receive_id)) {
    res.json({ success: false, error: "Zap request not found" });
    return;
  }

  // Get tx from zapRequestEventId
  const tx = await db
    .knex("external_receive")
    .select("external_id")
    .where("id", "=", zapRequest.external_receive_id)
    .from("external_receive")
    .first();

  if (!tx) {
    res.json({ success: false, error: "Transaction not found" });
    return;
  }

  // Get comment
  const comment = await db
    .knex("comment")
    .where("comment.tx_id", "=", tx.external_id)
    .first();

  // Check if user is authorized to update comment
  if (pubkey !== comment.user_id) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  // Update comment with kind1EventId using zapRequestEventId as lookup
  const updatedComment = await db
    .knex("comment")
    .where("comment.id", "=", comment.id)
    .update({ event_id: kind1EventId }, ["id", "event_id"]);

  if (!updatedComment) {
    res.json({ success: false, error: "Failed to update kind 1 for comment" });
    return;
  }

  res.json({ success: true, data: updatedComment });
});

const post_reply = asyncHandler(async (req, res, next) => {
  const { commentId, content } = req.body;
  const pubkey = (res.locals?.authEvent as Event)?.pubkey;

  if (!commentId) {
    res.status(400).json({
      success: false,
      error: "commentId is required",
    });
  }

  const comment = await prisma.comment.findUnique({
    where: { id: parseInt(commentId) },
  });

  if (!comment) {
    res.json({ success: false, error: "Comment not found" });
    return;
  }

  const reply = await prisma.comment.create({
    data: {
      content,
      parentId: comment.id,
      userId: pubkey,
      ampId: 0,
    },
  });

  if (!reply.id) {
    res.json({ success: false, error: "Failed to create reply" });
  }
  res.json({ success: true, data: reply });
});

export default {
  get_comments,
  get_podcast_comments,
  get_artist_comments,
  get_album_comments,
  get_comment_by_id,
  update_event_id,
  post_reply,
};

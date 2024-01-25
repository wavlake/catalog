import prisma from "../prisma/client";
import asyncHandler from "express-async-handler";
import { getAllComments } from "../library/comments";
import { formatError } from "../library/errors";

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

export default {
  get_comments,
  get_podcast_comments,
  get_artist_comments,
  get_album_comments,
};

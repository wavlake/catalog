import { formatError } from "../library/errors";
import prisma from "../prisma/client";
import asyncHandler from "express-async-handler";
import { getAllComments } from "../library/comments";

// Pagination and ID validation middleware
const validatePaginationAndId = (idField) => {
  return async (req, res, next) => {
    const { page = "1", pageSize = "100" } = req.params;
    const id = req.params[idField];

    const pageInt = parseInt(page);
    if (!Number.isInteger(pageInt) || pageInt <= 0) {
      return next(formatError(400, "Page must be a positive integer"));
    }

    const pageSizeInt = parseInt(pageSize);
    if (!Number.isInteger(pageSizeInt) || pageSizeInt <= 0) {
      return next(formatError(400, "Page size must be a positive integer"));
    }

    if (!id) {
      return next(formatError(400, `Must include the ${idField}`));
    }

    req.pagination = {
      page: pageInt,
      pageSize: pageSizeInt,
      offset: (pageInt - 1) * pageSizeInt,
    };
    next();
  };
};

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
  get_comments: [validatePaginationAndId("contentId"), get_comments],
  get_podcast_comments: [
    validatePaginationAndId("podcastId"),
    get_podcast_comments,
  ],
  get_artist_comments: [
    validatePaginationAndId("artistId"),
    get_artist_comments,
  ],
  get_album_comments: [validatePaginationAndId("albumId"), get_album_comments],
};

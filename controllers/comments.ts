import { formatError } from "../library/errors";
import prisma from "../prisma/client";
import asyncHandler from "express-async-handler";
import { getAllComments } from "../library/comments";

const get_comments = asyncHandler(async (req, res, next) => {
  const { id: contentId } = req.params;
  if (!contentId) {
    const error = formatError(400, "Must include a track or episode id");
    next(error);
    return;
  }

  const combinedAndSortedComments = await getAllComments([contentId], 100);

  res.json({
    success: true,
    data: combinedAndSortedComments,
  });
});

const get_artist_comments_paginated = asyncHandler(async (req, res, next) => {
  const { id: artistId, page, pageSize } = req.params;
  if (!artistId) {
    const error = formatError(400, "Must include a track or episode id");
    next(error);
    return;
  }
  const pageInt = parseInt(page);
  if (!Number.isInteger(pageInt) || pageInt <= 0) {
    const error = formatError(400, "Page must be a positive integer");
    next(error);
    return;
  }
  const pageSizeInt = parseInt(pageSize);
  if (!Number.isInteger(pageSizeInt) || pageSizeInt <= 0) {
    const error = formatError(400, "Page size must be a positive integer");
    next(error);
    return;
  }

  // Calculate skip and take for pagination
  const skip = (pageInt - 1) * pageSizeInt;
  const take = pageSizeInt;

  // Fetch tracks for the given artist ID
  const tracks = await prisma.track.findMany({
    where: {
      artistId,
    },
    select: {
      id: true,
    },
  });

  const trackIds = tracks.map((track) => track.id);

  if (trackIds.length === 0) {
    // No tracks found for the given artist ID
    res.json({
      success: true,
      data: [],
    });
    return;
  }

  const comments = await prisma.comment.findMany({
    where: {
      contentId: {
        in: trackIds,
      },
    },
    skip: skip,
    take: take,
    orderBy: {
      createdAt: "desc", // newest first
    },
    // include: {
    // track: true,
    // user: true, // If you want details of the user who made the comment
    // },
  });

  res.json({
    success: true,
    data: comments,
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
    episodes.map(({ id }) => id),
    100
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

  const tracks = await prisma.trackInfo.findMany({
    where: { artistId: artistId },
  });

  const comments = await getAllComments(
    tracks.map(({ id }) => id),
    100
  );

  // TODO: Pagination
  res.json({
    success: true,
    data: comments,
  });
});

export default {
  get_comments,
  get_podcast_comments,
  get_artist_comments,
  get_artist_comments_paginated,
};

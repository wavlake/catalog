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
  const { id: artistId, page = "0", pageSize = "100" } = req.params;

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

  const offset = (pageInt - 1) * pageSizeInt; // Calculate the offset

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
    pageSizeInt,
    offset
  );

  res.json({
    success: true,
    data: comments,
  });
});

export default {
  get_comments,
  get_podcast_comments,
  get_artist_comments,
};

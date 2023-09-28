import { formatError } from "../library/errors";
import prisma from "../prisma/client";
import asyncHandler from "express-async-handler";

const getAllComments = async (contentIds: string[]) => {
  const userComments = await prisma.comment.findMany({
    where: {
      AND: [
        {
          OR: contentIds.map((id) => ({
            contentId: id,
          })),
        },
        { isNostr: false },
      ],
    },
  });

  const commentsWithUserInfo = await Promise.all(
    userComments.map(async (comment) => {
      const user = await prisma.user.findUnique({
        where: { id: comment.userId },
      });

      return {
        ...comment,
        name: user.name,
        commenterProfileUrl: user.profileUrl,
        commenterArtworkUrl: user.artworkUrl,
      };
    })
  );

  const nostrComments = await prisma.comment.findMany({
    where: {
      AND: [
        {
          OR: contentIds.map((id) => ({
            contentId: id,
          })),
        },
        { isNostr: true },
      ],
    },
  });

  const sortedComments = [...commentsWithUserInfo, ...nostrComments].sort(
    (a, b) => (a.createdAt < b.createdAt ? 1 : -1)
  );

  const commentsWithSatAmount = await Promise.all(
    sortedComments.map(async (comment) => {
      const amp = await prisma.amp.findUnique({
        where: { id: comment.ampId },
      });

      return {
        ...comment,
        commentMsatSum: amp.msat_amount,
      };
    })
  );
  return commentsWithSatAmount;
};

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

  const combinedAndSortedComments = await getAllComments(
    tracks.map(({ id }) => id)
  );

  res.json({ success: true, data: combinedAndSortedComments });
});

export default {
  get_comments,
  get_podcast_comments,
  get_artist_comments,
};

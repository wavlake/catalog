import prisma from "../prisma/client";
import asyncHandler from "express-async-handler";

const get_comments = asyncHandler(async (req, res, next) => {
  const { id: contentId } = req.params;

  const comments = await prisma.comment.findMany({
    where: { content_id: contentId },
  });
  console.log("Found comments -------------", comments);
  res.json({ success: true, data: comments });
});

const get_podcast_comments = asyncHandler(async (req, res, next) => {
  const { id: podcastId } = req.params;
  const episodes = await prisma.episode.findMany({
    where: { podcastId },
  });
  const comments = await prisma.comment.findMany({
    where: {
      OR: episodes.map(({ id }) => ({
        content_id: id,
      })),
    },
  });
  console.log("Found comments -------------", comments);
  res.json({ success: true, data: comments });
});

const get_artist_comments = asyncHandler(async (req, res, next) => {
  const { id: artistId } = req.params;
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

  const comments = await prisma.comment.findMany({
    where: {
      OR: tracks.map(({ id }) => ({
        content_id: id,
      })),
    },
  });
  console.log("Found comments -------------", comments);
  res.json({ success: true, data: comments });
});

export default {
  get_comments,
  get_podcast_comments,
  get_artist_comments,
};

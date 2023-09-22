import prisma from "../prisma/client";
import asyncHandler from "express-async-handler";

const get_episode_comments = asyncHandler(async (req, res, next) => {
  const { id: episodeId } = req.params;

  const track = await prisma.comment.findMany({
    where: { amp_id: episodeId },
  });

  res.json({ success: true, data: track });
});

const get_track_comments = asyncHandler(async (req, res, next) => {
  const { id: trackId } = req.params;

  const track = await prisma.episodeInfo.findFirstOrThrow({
    where: { id: trackId },
  });

  res.json({ success: true, data: track });
});

export default {
  get_episode_comments,
  get_track_comments,
};

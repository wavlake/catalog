import prisma from "../prisma/client";
import asyncHandler from "express-async-handler";

type Comment = {
  id: number;
  user_id: string;
  amp_id: number;
  content: string;
  parent_id: number;
  created_at: string;
};

const mockComments: Comment[] = [
  {
    id: 1,
    user_id: "def-12",
    amp_id: 12,
    content: "Cool track",
    parent_id: 13,
    created_at: "jkl-56",
  },
  {
    id: 1,
    user_id: "abc-73",
    amp_id: 12,
    content:
      "That was an awesome episode, i would listen to it again, especially while driving, or on a plane, or maybe on a train, or if i needed to fall asleep, or was working the night shift. Great for any and all occasion. This is a long comment, ok cool.",
    parent_id: 13,
    created_at: "pqr-91",
  },
];

const get_episode_comments = asyncHandler(async (req, res, next) => {
  const { id: episodeId } = req.params;

  // const track = await prisma.comment.findMany({
  //   where: { amp_id: episodeId },
  // });

  res.json({ success: true, data: mockComments });
});

const get_track_comments = asyncHandler(async (req, res, next) => {
  const { id: trackId } = req.params;

  // const track = await prisma.episodeInfo.findFirstOrThrow({
  //   where: { id: trackId },
  // });

  res.json({ success: true, data: mockComments });
});

export default {
  get_episode_comments,
  get_track_comments,
};

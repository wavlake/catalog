import asyncHandler from "express-async-handler";
import { randomUUID } from "crypto";
import prisma from "../prisma/client";

export const createPlaylist = asyncHandler(async (req, res, next) => {
  const userId = req["uid"];
  const newPlaylistId = randomUUID();
  const { title } = req.body;

  if (!title) {
    res.json({ status: "error", message: "Title is required" });
    return;
  }

  const newPlaylist = await prisma.playlist.create({
    data: {
      id: newPlaylistId,
      title: title,
      userId: userId,
      isFavorites: false,
    },
  });

  res.json({ status: "success", data: newPlaylist });
  return;
});

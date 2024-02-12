import asyncHandler from "express-async-handler";
import { validate } from "uuid";
import { randomUUID } from "crypto";
import { formatError } from "../library/errors";
import prisma from "../prisma/client";
import { Event } from "nostr-tools";

export const getPlaylists = async (req, res, next) => {
  const { id } = req.params;

  if (!id) {
    next(formatError(400, "Missing playlist ID"));
    return;
  }

  if (validate(id) === false) {
    next(formatError(400, "Invalid playlist ID"));
    return;
  }

  const playlistTracks = await prisma.playlistTrack.findMany({
    where: { playlistId: id },
    select: {
      trackId: true,
      order: true,
    },
    orderBy: { order: "asc" },
  });

  if (!playlistTracks) {
    next(formatError(404, "Playlist ID not found"));
    return;
  }

  const trackInfo = await prisma.trackInfo.findMany({
    where: {
      id: {
        in: playlistTracks.map((track) => track.trackId),
      },
    },
    select: {
      id: true,
      title: true,
      duration: true,
      artist: true,
      artworkUrl: true,
      artistUrl: true,
    },
  });

  res.json({ success: true, data: trackInfo });
};

export const createPlaylist = asyncHandler(async (req, res, next) => {
  let userId: string;
  try {
    const { pubkey } = res.locals.authEvent as Event;

    if (!pubkey) {
      res.json({ status: "error", message: "No pubkey found" });
      return;
    }
    userId = pubkey;
  } catch (error) {
    res.json({ status: "error", message: "Error parsing event" });
    return;
  }

  const { title } = req.body;
  if (!title) {
    res.json({ status: "error", message: "Title is required" });
    return;
  }

  const newPlaylistId = randomUUID();
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

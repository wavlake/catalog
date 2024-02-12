import asyncHandler from "express-async-handler";
import { validate } from "uuid";
import { randomUUID } from "crypto";
import { formatError } from "../library/errors";
import prisma from "../prisma/client";
import { Event } from "nostr-tools";
import db from "../library/db";
import log from "loglevel";

export const addTrackToPlaylist = asyncHandler(async (req, res, next) => {
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

  const { playlistId, trackId } = req.body;

  if (!playlistId || !trackId) {
    res.json({
      status: "error",
      message: "Playlist ID and track ID are required",
    });
    return;
  }

  if (validate(playlistId) === false || validate(trackId) === false) {
    res.json({ status: "error", message: "Invalid playlist ID or track ID" });
    return;
  }

  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
  });

  if (!playlist) {
    res.json({ status: "error", message: `Playlist ${playlistId} not found` });
    return;
  }

  if (playlist.userId !== userId) {
    res.status(403).json({ status: "error", message: "Forbidden" });
    return;
  }

  const existingTrack = await prisma.trackInfo.findUnique({
    where: { id: trackId },
  });
  console.log(existingTrack);

  if (!existingTrack) {
    res.json({ status: "error", message: `Track ${trackId} does not exist` });
    return;
  }

  const lastPlaylistTrack = await prisma.playlistTrack.findFirst({
    where: { playlistId: playlistId },
    orderBy: { order: "desc" },
  });

  // If there are no tracks in the playlist, set the order to 0
  const order = lastPlaylistTrack ? parseInt(lastPlaylistTrack.order) + 1 : 0;
  const playlistTrack = await prisma.playlistTrack.create({
    data: {
      playlistId: playlistId,
      trackId: trackId,
      order: order.toString(),
    },
  });

  res.json({ success: true, data: playlistTrack });
  return;
});

export const getPlaylist = async (req, res, next) => {
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

  const trackInfo = await db
    .knex("track_info")
    .join("playlist_track", "track_info.id", "playlist_track.track_id")
    .select(
      "track_info.id",
      "title",
      "duration",
      "artist",
      "artwork_url as artworkUrl",
      "artist_url as artistUrl",
      "live_url as liveUrl",
      "album_title as albumTitle",
      "album_id as albumId",
      "artist_id as artistId",
      "playlist_track.order as order"
    )
    .where("playlist_track.playlist_id", id)
    .orderBy("order", "asc");

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

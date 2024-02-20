import asyncHandler from "express-async-handler";
import { validate } from "uuid";
import { randomUUID } from "crypto";
import prisma from "../prisma/client";
import { Event } from "nostr-tools";
import db from "../library/db";
import log from "loglevel";

export const addTrackToPlaylist = asyncHandler(async (req, res, next) => {
  let userId: string;
  try {
    const { pubkey } = res.locals.authEvent as Event;

    if (!pubkey) {
      res.status(400).json({ success: false, error: "No pubkey found" });
      return;
    }
    userId = pubkey;
  } catch (error) {
    res.status(400).json({ success: false, error: "Error parsing event" });
    return;
  }

  const { playlistId, trackId } = req.body;

  if (!playlistId || !trackId) {
    res.status(400).json({
      success: false,
      error: "playlistId and trackId are required",
    });
    return;
  }

  if (validate(playlistId) === false || validate(trackId) === false) {
    res
      .status(400)
      .json({ success: false, error: "Invalid playlistId or trackId" });
    return;
  }

  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
  });

  if (!playlist) {
    res
      .status(404)
      .json({ success: false, error: `Playlist ${playlistId} not found` });
    return;
  }

  if (playlist.userId !== userId) {
    res.status(403).json({ success: false, error: "Forbidden" });
    return;
  }

  const existingTrack = await prisma.trackInfo.findUnique({
    where: { id: trackId },
  });

  if (!existingTrack) {
    res
      .status(404)
      .json({ success: false, error: `Track ${trackId} does not exist` });
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

const SORT_BY_SATS = "sats";

export const getPlaylist = async (req, res, next) => {
  const { id } = req.params;
  const { sort } = req.query;

  if (!id) {
    res.status(400).json({
      success: false,
      error: "playlistId is required",
    });
    return;
  }

  if (validate(id) === false) {
    res.status(400).json({
      success: false,
      error: "Invalid playlistId",
    });
    return;
  }

  const playlist = await prisma.playlist.findUnique({
    where: { id: id },
  });

  if (!playlist) {
    res.status(404).json({
      success: false,
      error: `Playlist ${id} not found`,
    });
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
    res.json({
      success: true,
      data: [],
    });
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

  if (sort === SORT_BY_SATS) {
    const BEGIN_DATE = new Date("2023-10-01");
    const END_DATE = new Date("2024-4-20");

    log.debug("Sorting playlist by sats");
    const trackIds = trackInfo.map((track) => track.id);
    const trackSatsInTimeframe = await db
      .knex("amp")
      .select("track_id")
      .sum("msat_amount as mSatsInTimePeriod")
      .where("created_at", ">=", BEGIN_DATE)
      .andWhere("created_at", "<=", END_DATE)
      .whereIn("track_id", trackIds)
      .groupBy("track_id");

    trackInfo.forEach((track) => {
      const trackSatInfo = trackSatsInTimeframe.find(
        (t) => t.track_id === track.id
      );
      track.mSatsInTimePeriod = trackSatInfo?.mSatsInTimePeriod ?? 0;
    });

    trackInfo.sort((a, b) => {
      const aTotal = parseInt(a.mSatsInTimePeriod);
      const bTotal = parseInt(b.mSatsInTimePeriod);
      return bTotal - aTotal;
    });
  }

  res.json({
    success: true,
    data: trackInfo,
  });
};

export const createPlaylist = asyncHandler(async (req, res, next) => {
  let userId: string;
  try {
    const { pubkey } = res.locals.authEvent as Event;

    if (!pubkey) {
      res.status(400).json({ success: false, error: "No pubkey found" });
      return;
    }
    userId = pubkey;
  } catch (error) {
    res.status(400).json({ success: false, error: "Error parsing event" });
    return;
  }

  const { title } = req.body;
  if (!title) {
    res.status(400).json({ success: false, error: "Title is required" });
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

  res.json({ success: true, data: newPlaylist });
  return;
});

export const deletePlaylist = asyncHandler(async (req, res, next) => {
  let userId: string;
  try {
    const { pubkey } = res.locals.authEvent as Event;

    if (!pubkey) {
      res.status(400).json({ success: false, error: "No pubkey found" });
      return;
    }
    userId = pubkey;
  } catch (error) {
    res.status(400).json({ success: false, error: "Error parsing event" });
    return;
  }

  const { id } = req.params;
  if (!id) {
    res.status(400).json({ success: false, error: "playlistId is required" });
    return;
  }

  if (validate(id) === false) {
    res.status(400).json({ success: false, error: "Invalid playlistId" });
    return;
  }

  const playlist = await prisma.playlist.findUnique({
    where: { id: id },
  });

  if (!playlist) {
    res.status(404).json({ success: false, error: `Playlist ${id} not found` });
    return;
  }

  if (playlist.userId !== userId) {
    res.status(403).json({ success: false, error: "Forbidden" });
    return;
  }

  await prisma.playlistTrack.deleteMany({
    where: { playlistId: id },
  });

  await prisma.playlist.delete({
    where: { id: id },
  });

  res.json({ success: true });
  return;
});

export const removeTrackFromPlaylist = asyncHandler(async (req, res, next) => {
  let userId: string;
  try {
    const { pubkey } = res.locals.authEvent as Event;

    if (!pubkey) {
      res.status(400).json({ success: false, error: "No pubkey found" });
      return;
    }
    userId = pubkey;
  } catch (error) {
    res.status(400).json({ success: false, error: "Error parsing event" });
    return;
  }

  const { playlistId, trackId } = req.body;

  if (!playlistId || !trackId) {
    res.status(400).json({
      success: false,
      error: "playlistId and trackId are required",
    });
    return;
  }

  if (validate(playlistId) === false || validate(trackId) === false) {
    res
      .status(400)
      .json({ success: false, error: "Invalid playlistId or trackId" });
    return;
  }

  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
  });

  if (!playlist) {
    res
      .status(404)
      .json({ success: false, error: `Playlist ${playlistId} not found` });
    return;
  }

  if (playlist.userId !== userId) {
    res.status(403).json({ success: false, error: "Forbidden" });
    return;
  }

  const playlistTrack = await prisma.playlistTrack.findFirst({
    where: { playlistId: playlistId, trackId: trackId },
  });

  if (!playlistTrack) {
    res.status(404).json({
      success: false,
      error: `Track ${trackId} not found in playlist`,
    });
    return;
  }

  await prisma.playlistTrack.deleteMany({
    where: { playlistId: playlistId, id: playlistTrack.id },
  });

  res.json({ success: true });
  return;
});

export const reorderPlaylist = asyncHandler(async (req, res, next) => {
  let userId: string;
  try {
    const { pubkey } = res.locals.authEvent as Event;

    if (!pubkey) {
      res.status(400).json({ success: false, error: "No pubkey found" });
      return;
    }
    userId = pubkey;
  } catch (error) {
    res.status(400).json({ success: false, error: "Error parsing event" });
    return;
  }

  const { playlistId, trackList } = req.body;

  if (
    !playlistId ||
    !trackList ||
    !Array.isArray(trackList) ||
    trackList.length === 0
  ) {
    res.status(400).json({
      success: false,
      error: "playlistId and trackList are required",
    });
    return;
  }

  if (
    validate(playlistId) === false ||
    !trackList.every(validate)
  ) {
    res.status(400).json({
      success: false,
      error: "Invalid playlistId or trackId in trackList",
    });
    return;
  }

  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
  });

  if (!playlist) {
    res
      .status(404)
      .json({ success: false, error: `Playlist ${playlistId} not found` });
    return;
  }

  if (playlist.userId !== userId) {
    res.status(403).json({ success: false, error: "Forbidden" });
    return;
  }

  // Ensure all tracks exist
  const validTracks = await prisma.trackInfo.findMany({
    where: { id: { in: trackList } },
  });

  if (validTracks.length != trackList.length) {
    res.status(400).json({
      success: false,
      error: `trackList contains one or more invalid track ids`,
    });
    return;
  }

  const newPlaylistOrder = trackList.map((trackId, index) => {
    return { playlist_id: playlistId, track_id: trackId, order: index };
  });

  // Delete all tracks from the playlist and reinsert them in the new order
  await prisma.playlistTrack.deleteMany({
    where: { playlistId: playlistId },
  });

  const newPlaylist = await db
    .knex("playlist_track")
    .insert(newPlaylistOrder, ["track_id as trackId", "order"]);

  res.json({ success: true, data: newPlaylist });
  return;
});

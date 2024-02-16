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
      error: "Playlist ID and track ID are required",
    });
    return;
  }

  if (validate(playlistId) === false || validate(trackId) === false) {
    res
      .status(400)
      .json({ success: false, error: "Invalid playlist ID or track ID" });
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
  const { sort, startDate, endDate } = req.query;

  if (!id) {
    res.status(400).json({
      success: false,
      error: "Playlist ID is required",
    });
    return;
  }

  if (validate(id) === false) {
    res.status(400).json({
      success: false,
      error: "Invalid playlist id",
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
    res.status(404).json({
      success: false,
      error: "Playlist not found",
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
    if (!startDate || !endDate) {
      res.status(400).json({
        success: false,
        error: "Start and end date are required when sorting by sats",
      });
      return;
    }

    const startDateValid = await validateDateString(startDate);
    const endDateValid = await validateDateString(endDate);

    if (!startDateValid || !endDateValid) {
      res.status(400).json({
        success: false,
        error: "Invalid start or end date (format: YYYY-MM-DD)",
      });
      return;
    }

    const BEGIN_DATE = new Date(startDate);
    const END_DATE = new Date(endDate);

    const daysWindow =
      (END_DATE.getTime() - BEGIN_DATE.getTime()) / (1000 * 60 * 60 * 24);

    if (daysWindow < 0 || daysWindow > 90) {
      res.status(400).json({
        success: false,
        error: "Date range must be between 0 and 90 days",
      });
      return;
    }

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

async function validateDateString(dateString: string) {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return false;
  }
  return true;
}

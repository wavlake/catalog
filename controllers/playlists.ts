import asyncHandler from "express-async-handler";
import { validate } from "uuid";
import { randomUUID } from "crypto";
import prisma from "../prisma/client";
import { Event } from "nostr-tools";
import db from "../library/db";
import { isValidDateString } from "../library/validation";
import { getUserIds, userOwnsContent } from "../library/userHelper";

const MAX_PLAYLIST_LENGTH = 200;
export const addTrackToPlaylist = asyncHandler(async (req, res, next) => {
  let userId: string = req["uid"];

  if (!userId) {
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

  if (!userOwnsContent(playlist.userId, userId)) {
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

  const currentPlaylistTracks = await prisma.playlistTrack.findMany({
    where: { playlistId: playlistId },
    orderBy: { orderInt: "desc" },
  });

  if (currentPlaylistTracks.length >= MAX_PLAYLIST_LENGTH) {
    res.status(400).json({
      success: false,
      error: `Playlist ${playlistId} is at max length of ${MAX_PLAYLIST_LENGTH}`,
    });
    return;
  }
  const lastPlaylistTrack = currentPlaylistTracks[0];

  // If there are no tracks in the playlist, set the order to 0
  const order = lastPlaylistTrack ? lastPlaylistTrack.orderInt + 1 : 0;
  const playlistTrack = await prisma.playlistTrack.create({
    data: {
      playlistId: playlistId,
      trackId: trackId,
      orderInt: order,
      // order column is deprecated but required
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

  const playlistMetadata = await prisma.playlist.findUnique({
    where: { id: id },
    select: {
      title: true,
      userId: true,
    },
  });

  const playlistTracks = await prisma.playlistTrack.findMany({
    where: { playlistId: id },
    select: {
      trackId: true,
      orderInt: true,
    },
    orderBy: { orderInt: "asc" },
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
      "playlist_track.order_int as order"
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

    const startDateValid = await isValidDateString(startDate);
    const endDateValid = await isValidDateString(endDate);

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
      .sum("msat_amount as msatTotal")
      .where("created_at", ">=", BEGIN_DATE)
      .andWhere("created_at", "<=", END_DATE)
      .whereIn("track_id", trackIds)
      .groupBy("track_id");

    trackInfo.forEach((track) => {
      const trackSatInfo = trackSatsInTimeframe.find(
        (t) => t.track_id === track.id
      );
      track.msatTotal = trackSatInfo?.msatTotal ?? 0;
    });

    trackInfo.sort((a, b) => {
      const aTotal = parseInt(a.msatTotal);
      const bTotal = parseInt(b.msatTotal);
      return bTotal - aTotal;
    });
  }

  res.json({
    success: true,
    data: {
      title: playlistMetadata.title,
      userId: playlistMetadata.userId,
      tracks: trackInfo,
    },
  });
};

// playlists are publically accessible via the user id (npub or firebase uid)
export const getUserPlaylists = asyncHandler(async (req, res, next) => {
  const pubkey = (res.locals?.authEvent as Event)?.pubkey;
  const id = req.params.id;

  // use auth token uid, nip-98 pubkey, or id from request params
  const userId = req["uid"] ?? pubkey ?? id;
  if (!userId) {
    res.status(400).json({ success: false, error: "Must provde a user id" });
    return;
  }

  // need to get all user ids for the user (npub(s) + firebase uid)
  const userIds = await getUserIds(userId);
  const playlists = await prisma.playlist.findMany({
    where: { userId: { in: userIds } },
  });

  const playlistsWithTracks = [];
  for (const playlist of playlists) {
    const tracks = await db
      .knex("playlist_track")
      .select(
        "track_info.id",
        "track_info.title",
        "track_info.duration",
        "track_info.artist",
        "track_info.artwork_url as artworkUrl",
        "playlist_track.order_int as order"
      )
      .join("track_info", "track_info.id", "=", "playlist_track.track_id")
      .where("playlist_track.playlist_id", playlist.id)
      .orderBy("playlist_track.order_int", "asc");

    const playlistObject = {
      id: playlist.id,
      title: playlist.title,
      tracks: tracks,
    };

    playlistsWithTracks.push(playlistObject);
  }
  res.json({ success: true, data: playlistsWithTracks });
  return;
});

export const createPlaylist = asyncHandler(async (req, res, next) => {
  let userId: string = req["uid"];
  if (!userId) {
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
  }

  const { title, isFavorites = false } = req.body;
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
      isFavorites,
    },
  });

  res.json({ success: true, data: newPlaylist });
  return;
});

export const deletePlaylist = asyncHandler(async (req, res, next) => {
  let userId: string = req["uid"];
  if (!userId) {
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

  if (!userOwnsContent(playlist.userId, userId)) {
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
  let userId: string = req["uid"];
  if (!userId) {
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

  if (!userOwnsContent(playlist.userId, userId)) {
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
  let userId: string = req["uid"];
  if (!userId) {
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

  if (validate(playlistId) === false || !trackList.every(validate)) {
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

  if (!userOwnsContent(playlist.userId, userId)) {
    res.status(403).json({ success: false, error: "Forbidden" });
    return;
  }

  // Ensure all tracks exist
  const validTracks = await prisma.trackInfo.findMany({
    where: { id: { in: trackList } },
  });

  // validTracks is a deduped array of trackInfo objects
  const deduplicatedTrackList = Array.from(new Set(trackList));

  if (validTracks.length != deduplicatedTrackList.length) {
    res.status(400).json({
      success: false,
      error: `trackList contains one or more invalid track ids`,
    });
    return;
  }

  const newPlaylistOrder = trackList.map((trackId, index) => {
    return {
      playlist_id: playlistId,
      track_id: trackId,
      order_int: index,
      order: index.toString().padStart(4, "0"),
    };
  });

  // Delete all tracks from the playlist and reinsert them in the new order
  await prisma.playlistTrack.deleteMany({
    where: { playlistId: playlistId },
  });

  const newPlaylist = await db
    .knex("playlist_track")
    .insert(newPlaylistOrder, ["track_id as trackId"]);

  res.json({ success: true, data: newPlaylist });
  return;
});

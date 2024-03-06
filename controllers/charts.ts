import prisma from "../prisma/client";
import db from "../library/db";
const log = require("loglevel");
const asyncHandler = require("express-async-handler");
import { isValidDateString } from "../library/validation";

// Top 40
const get_top_forty = asyncHandler(async (req, res, next) => {
  const { limit, phase }: { limit: number; phase: string } = {
    limit: req.query.limit ? parseInt(req.query.limit) : 50,
    phase: req.query.phase ? req.query.phase : "week", // week by default
  };

  const validPhases = ["day", "week", "month"];
  if (!validPhases.includes(phase)) {
    res.json({
      success: false,
      error: "Invalid phase, must be one of: day, week, month",
    });
    return;
  }

  if (phase === "day") {
    const tracks = await prisma.trackInfo.findMany({
      where: { msatTotal1Days: { gt: 0 } },
      orderBy: { msatTotal1Days: "desc" },
      take: limit,
    });
    res.json({ success: true, data: tracks });
  } else if (phase === "month") {
    const tracks = await prisma.trackInfo.findMany({
      where: { msatTotal30Days: { gt: 0 } },
      orderBy: { msatTotal30Days: "desc" },
      take: limit,
    });
    res.json({ success: true, data: tracks });
  } else if (phase === "week") {
    const tracks = await prisma.trackInfo.findMany({
      where: { msatTotal7Days: { gt: 0 } },
      orderBy: { msatTotal7Days: "desc" },
      take: limit,
    });
    res.json({ success: true, data: tracks });
  }
});

const get_custom_chart = asyncHandler(async (req, res, next) => {
  const { sort = "sats", startDate, endDate, limit = 100, genre } = req.query;

  const validSorts = ["sats"];

  if (!validSorts.includes(sort)) {
    res.json({
      success: false,
      error: "Invalid sort, must be one of: sats",
    });
    return;
  }

  if (!startDate) {
    res.json({
      success: false,
      error: "startDate is required",
    });
    return;
  }

  const endDateResolved = endDate
    ? endDate
    : new Date().toISOString().split("T")[0];

  const startDateValid = await isValidDateString(startDate);
  const endDateValid = await isValidDateString(endDateResolved);

  if (!startDateValid || !endDateValid) {
    res.status(400).json({
      success: false,
      error: "Invalid start or end date (format: YYYY-MM-DD)",
    });
    return;
  }

  const startDateFormatted = new Date(startDate);
  const endDateFormatted = new Date(endDateResolved);

  const daysWindow =
    (endDateFormatted.getTime() - startDateFormatted.getTime()) /
    (1000 * 60 * 60 * 24);

  if (daysWindow < 0 || daysWindow > 90) {
    res.status(400).json({
      success: false,
      error: "Date range must be between 0 and 90 days",
    });
    return;
  }

  if (limit && parseInt(limit) > 100) {
    res.status(400).json({
      success: false,
      error: "limit must be 100 or less",
    });
    return;
  }

  let genreId: { id: number } = null;
  if (genre) {
    console.log("genre", genre);
    genreId = await prisma.musicGenre.findFirst({
      where: { name: { contains: genre, mode: "insensitive" } }, // case insensitive lookup
      select: {
        id: true,
      },
    });
    console.log("genreId", genreId);

    if (!genreId) {
      res.status(400).json({
        success: false,
        error: "Genre does not exist",
      });
      return;
    }
  }

  const tracks = !genreId
    ? await db
        .knex("track_info")
        .join("amp", "track_info.id", "amp.track_id")
        .select(
          "track_info.id as id",
          db.knex.raw("min(track_info.album_id::text) as albumId"),
          db.knex.raw("min(track_info.artist_id::text) as artistId")
        )
        .min("track_info.title as title")
        .min("track_info.artist as artist")
        .min("track_info.artist_url as artistUrl")
        .min("track_info.avatar_url as avatarUrl")
        .min("track_info.artwork_url as artworkUrl")
        .min("track_info.album_title as albumTitle")
        .min("track_info.duration as duration")
        .min("track_info.live_url as liveUrl")
        .sum("amp.msat_amount as msatTotal")
        .where("amp.created_at", ">=", startDateFormatted)
        .andWhere("amp.created_at", "<=", endDateFormatted)
        .groupBy("track_info.id")
        .orderBy("msatTotal", "desc")
        .limit(limit ? parseInt(limit) : 10)
    : await db
        .knex("track_info")
        .join("amp", "track_info.id", "amp.track_id")
        .join("music_genre", "track_info.genre_id", "music_genre.id")
        .select(
          "track_info.id as id",
          db.knex.raw("min(track_info.album_id::text) as albumId"),
          db.knex.raw("min(track_info.artist_id::text) as artistId")
        )
        .min("track_info.title as title")
        .min("track_info.artist as artist")
        .min("track_info.artist_url as artistUrl")
        .min("track_info.avatar_url as avatarUrl")
        .min("track_info.artwork_url as artworkUrl")
        .min("track_info.album_title as albumTitle")
        .min("track_info.duration as duration")
        .min("track_info.live_url as liveUrl")
        .sum("amp.msat_amount as msatTotal")
        .where("amp.created_at", ">=", startDateFormatted)
        .andWhere("amp.created_at", "<=", endDateFormatted)
        .andWhere("track_info.genre_id", "=", genreId.id)
        .groupBy("track_info.id")
        .orderBy("msatTotal", "desc")
        .limit(limit ? parseInt(limit) : 10);

  res.json({ success: true, data: tracks });
});

export default {
  get_top_forty,
  get_custom_chart,
};

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
  const { sort, startDate, endDate, limit } = req.query;

  const validSorts = ["sats", "plays"];

  if (!validSorts.includes(sort)) {
    res.json({
      success: false,
      error: "Invalid sort, must be one of: sats, plays",
    });
    return;
  }

  if (!startDate || !endDate) {
    res.json({
      success: false,
      error: "startDate and endDate are required",
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

  if (limit && parseInt(limit) > 100) {
    res.status(400).json({
      success: false,
      error: "limit must be 100 or less",
    });
    return;
  }

  const tracks = await db
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
    .where("amp.created_at", ">=", BEGIN_DATE)
    .andWhere("amp.created_at", "<=", END_DATE)
    .groupBy("track_info.id")
    .orderBy("msatTotal", "desc")
    .limit(limit ? parseInt(limit) : 10);

  res.json({ success: true, data: tracks });
});

export default {
  get_top_forty,
  get_custom_chart,
};

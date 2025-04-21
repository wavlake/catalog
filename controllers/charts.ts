import prisma from "../prisma/client";
import db from "../library/db";
const log = require("loglevel");
import { Request, Response, NextFunction } from "express";
const asyncHandler = require("express-async-handler");
import { isValidDateString } from "../library/validation";
import { addOP3URLPrefix } from "../library/op3";
interface QueryParams {
  limit?: string;
  phase?: string;
  timeWindow?: string;
  weightAmount?: string;
  weightRecency?: string;
  weightUniqueSupporters?: string;
  weightKeysend?: string;
  recencyDecay?: string;
  decayHalfLife?: string;
  minPayments?: string;
  applyActivityBonus?: string | boolean;
  activityBonus?: string;
  normalizeScores?: string | boolean;
  customDays?: string;
  sort?: string;
  startDate?: string;
  endDate?: string;
  genre?: string;
  days?: string;
}

interface Payment {
  trackId: string;
  satAmount: number;
  createdAt: Date;
  pubkey?: string;
}

interface TrackPaymentData {
  trackId: string;
  payments: Payment[];
  uniqueSupporters: Set<string>;
  totalAmount: number;
  latestPayment: number;
}

interface TrackScore {
  trackId: string;
  score: number;
  normalizedScore?: number;
  totalAmount: number;
  uniqueSupporters: number;
  paymentCount: number;
  latestPayment: number;
}

interface TrackResult {
  id: string;
  title?: string;
  artist?: string;
  artistUrl?: string;
  avatarUrl?: string;
  userId?: string;
  artworkUrl?: string;
  albumTitle?: string;
  liveUrl?: string;
  duration?: number;
  albumId?: string;
  artistId?: string;
  msatTotal?: bigint;
  genreId?: number;
  score: number;
  normalizedScore?: number;
  uniqueSupporters: number;
  paymentCount: number;
  recentActivityScore: number;
}

interface APIResponse {
  success: boolean;
  data?: any;
  error?: string;
  meta?: Record<string, any>;
}

// Top 40
const TOP_40_LIMIT = 40;
const get_top_forty = asyncHandler(async (req, res, next) => {
  const { limit, phase }: { limit: number; phase: string } = {
    limit: req.query.limit ? parseInt(req.query.limit) : TOP_40_LIMIT,
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

    // Add OP3 URL prefix to liveUrl
    tracks.forEach((track) => {
      track.liveUrl = addOP3URLPrefix({
        url: track.liveUrl,
        albumId: track.albumId,
      });
    });
    res.json({ success: true, data: tracks });
  } else if (phase === "month") {
    const tracks = await prisma.trackInfo.findMany({
      where: { msatTotal30Days: { gt: 0 } },
      orderBy: { msatTotal30Days: "desc" },
      take: limit,
    });

    // Add OP3 URL prefix to liveUrl
    tracks.forEach((track) => {
      track.liveUrl = addOP3URLPrefix({
        url: track.liveUrl,
        albumId: track.albumId,
      });
    });
    res.json({ success: true, data: tracks });
  } else if (phase === "week") {
    // const tracks = await prisma.trackInfo.findMany({
    //   where: { msatTotal7Days: { gt: 0 } },
    //   orderBy: { msatTotal7Days: "desc" },
    //   take: limit,
    // });
    const tracks = await db
      .knex("track_info")
      .select(
        "id",
        "title",
        "artist",
        "artist_url as artistUrl",
        "avatar_url as avatarUrl",
        "user_id as userId",
        "artwork_url as artworkUrl",
        "album_title as albumTitle",
        "live_url as liveUrl",
        "duration",
        "created_at as createdAt",
        "album_id as albumId",
        "artist_id as artistId",
        // "order",
        // "is_processing as isProcessing",
        "msat_total as msatTotal",
        // "published_at as publishedAt",
        // "is_draft as isDraft",
        // "is_explicit as isExplicit",
        // "genre_id as genreId",
        // "subgenre_id as subgenreId",
        // "compressor_error as compressorError",
        // "msat_total_1_days as msatTotal1Days",
        "msat_total_7_days as msatTotal7Days"
        // "msat_total_30_days as msatTotal30Days"
      )
      .where("msat_total_7_days", ">", 0)
      .orderBy("msatTotal7Days", "desc")
      .limit(limit);

    // Add OP3 URL prefix to liveUrl
    tracks.forEach((track) => {
      track.liveUrl = addOP3URLPrefix({
        url: track.liveUrl,
        albumId: track.albumId,
      });
    });

    res.json({ success: true, data: tracks });
  }
});

const get_custom_chart = asyncHandler(async (req, res, next) => {
  const {
    sort = "sats",
    startDate,
    endDate,
    limit = 100,
    genre,
    days,
  } = req.query;

  const validSorts = ["sats"];

  let daysInt = null;
  if (!!days) {
    daysInt = parseInt(days);
  }

  if ((!!daysInt && !!startDate) || (!!daysInt && !!endDate)) {
    res.status(400).json({
      success: false,
      error: "Cannot use days and date values together",
    });
    return;
  }

  if (!validSorts.includes(sort)) {
    res.status(400).json({
      success: false,
      error: "Invalid sort, must be one of: sats",
    });
    return;
  }

  if (!daysInt && !startDate && !endDate) {
    res.status(400).json({
      success: false,
      error: "startDate and endDate is required",
    });
    return;
  }

  let startDateResolved;
  let endDateResolved;

  if (!!days) {
    const date = new Date();
    startDateResolved = new Date(date.setDate(date.getDate() - days));
    endDateResolved = new Date();
  } else {
    const startDateValid = await isValidDateString(startDate);
    const endDateValid = await isValidDateString(endDate);

    if (!startDateValid || !endDateValid) {
      res.status(400).json({
        success: false,
        error: "Invalid start or end date (format: YYYY-MM-DD)",
      });
      return;
    }
    startDateResolved = new Date(startDate);
    endDateResolved = new Date(endDate);
  }

  const startDateFormatted = new Date(startDateResolved);
  const endDateFormatted = new Date(endDateResolved);

  const daysWindow =
    (endDateFormatted.getTime() - startDateFormatted.getTime()) /
    (1000 * 60 * 60 * 24);

  if (daysWindow < 0 || daysWindow > 90) {
    res.status(400).json({
      success: false,
      error: "Date range must be between 1 and 90 days",
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
    genreId = await prisma.musicGenre.findFirst({
      where: { name: { contains: genre, mode: "insensitive" } }, // case insensitive lookup
      select: {
        id: true,
      },
    });

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
          db.knex.raw(`min(track_info.album_id::text) as "albumId"`),
          db.knex.raw(`min(track_info.artist_id::text) as "artistId"`)
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
        .limit(parseInt(limit))
    : await db
        .knex("track_info")
        .join("amp", "track_info.id", "amp.track_id")
        .join("music_genre", "track_info.genre_id", "music_genre.id")
        .select(
          "track_info.id as id",
          db.knex.raw(`min(track_info.album_id::text) as "albumId"`),
          db.knex.raw(`min(track_info.artist_id::text) as "artistId"`)
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
        .limit(parseInt(limit));

  // Add OP3 URL prefix to liveUrl
  tracks.forEach((track) => {
    track.liveUrl = addOP3URLPrefix({
      url: track.liveUrl,
      albumId: track.albumId,
    });
  });

  res.json({ success: true, data: tracks });
});

const get_beta_top_forty = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Parse query parameters with defaults
      const {
        timeWindow = "week",
        limit = TOP_40_LIMIT.toString(),
        weightAmount = "1.0",
        weightRecency = "0.5",
        weightUniqueSupporters = "2.0",
        weightKeysend = "1.0",
        recencyDecay = "exponential",
        decayHalfLife = "3",
        minPayments = "3",
        applyActivityBonus = true,
        activityBonus = "1.2",
        normalizeScores = true,
        customDays,
      } = req.query as QueryParams;

      // Validate time window parameter
      const validTimeWindows = ["day", "week", "month", "custom"];
      if (!validTimeWindows.includes(timeWindow as string)) {
        res.status(400).json({
          success: false,
          error: "Invalid timeWindow, must be one of: day, week, month, custom",
        });
        return;
      }

      // If custom timeWindow, validate customDays
      let timeWindowMs: number;
      if (timeWindow === "custom") {
        if (
          !customDays ||
          isNaN(parseInt(customDays)) ||
          parseInt(customDays) <= 0 ||
          parseInt(customDays) > 90
        ) {
          res.status(400).json({
            success: false,
            error:
              "For custom timeWindow, customDays must be a number between 1 and 90",
          });
          return;
        }
        timeWindowMs = parseInt(customDays) * 24 * 60 * 60 * 1000;
      } else {
        // Set time window in milliseconds based on parameter
        const timeWindowMap: Record<string, number> = {
          day: 1 * 24 * 60 * 60 * 1000, // 1 day
          week: 7 * 24 * 60 * 60 * 1000, // 7 days
          month: 30 * 24 * 60 * 60 * 1000, // 30 days
        };
        timeWindowMs = timeWindowMap[timeWindow as string];
      }

      // Calculate start date based on time window
      const currentTime = new Date();
      const startDate = new Date(currentTime.getTime() - timeWindowMs);

      // Query for payments within the time window
      const payments = await db
        .knex("amp")
        .select(
          "track_id as trackId",
          "msat_amount as satAmount",
          "created_at as createdAt",
          "user_id as pubkey"
        )
        .where("created_at", ">=", startDate)
        .andWhere("content_type", "=", "track");

      // If no payments found, return empty array
      if (!payments.length) {
        res.json({ success: true, data: [] });
        return;
      }

      // Group payments by trackId
      const trackPayments: Record<string, TrackPaymentData> = {};

      payments.forEach((payment: Payment) => {
        const { trackId, satAmount, createdAt, pubkey } = payment;

        if (!trackPayments[trackId]) {
          trackPayments[trackId] = {
            trackId,
            payments: [],
            uniqueSupporters: new Set<string>(),
            totalAmount: 0,
            latestPayment: 0,
          };
        }

        trackPayments[trackId].payments.push(payment);
        trackPayments[trackId].totalAmount += satAmount;

        // Add pubkey to unique supporters if available
        if (pubkey) {
          trackPayments[trackId].uniqueSupporters.add(pubkey);
        }

        // Track latest payment timestamp
        const paymentTime = new Date(createdAt).getTime();
        if (paymentTime > trackPayments[trackId].latestPayment) {
          trackPayments[trackId].latestPayment = paymentTime;
        }
      });

      // Calculate scores for each track
      const tracksWithScores: TrackScore[] = Object.values(trackPayments)
        // Filter out tracks that don't meet the minimum payment threshold
        .filter((track) => track.payments.length >= parseInt(minPayments))
        .map((track) => {
          // Calculate base score from total amount
          let score: number = track.totalAmount * parseFloat(weightAmount);

          // Calculate recency score
          let recencyScore: number = 0;
          const decayRateMs: number =
            (parseFloat(decayHalfLife) * 24 * 60 * 60 * 1000) / Math.log(2);

          track.payments.forEach((payment) => {
            const paymentTime: number = new Date(payment.createdAt).getTime();
            const age: number = currentTime.getTime() - paymentTime;

            // Apply recency decay function
            let decay: number;
            if (recencyDecay === "linear") {
              decay = Math.max(0, 1 - age / timeWindowMs);
            } else if (recencyDecay === "exponential") {
              decay = Math.exp(-age / decayRateMs);
            } else {
              decay = 1; // No decay
            }

            recencyScore += payment.satAmount * decay;
          });

          score += recencyScore * parseFloat(weightRecency);

          // Add score for unique supporters
          score +=
            track.uniqueSupporters.size * parseFloat(weightUniqueSupporters);

          // Calculate keysend ratio and apply keysend weight
          const keysendPayments: number = track.payments.filter(
            (p) => !p.pubkey
          ).length;
          const keysendRatio: number = keysendPayments / track.payments.length;
          score *= 1 + keysendRatio * (parseFloat(weightKeysend) - 1);

          // Apply activity bonus if enabled
          if (applyActivityBonus === "true" || applyActivityBonus === true) {
            // Calculate consistency of payments over time
            const paymentTimes: number[] = track.payments
              .map((p) => new Date(p.createdAt).getTime())
              .sort((a, b) => a - b); // Ensure ascending order

            if (paymentTimes.length > 1) {
              // Calculate average time between payments
              let totalGap: number = 0;
              let gaps: number[] = [];

              for (let i = 1; i < paymentTimes.length; i++) {
                const gap: number = paymentTimes[i] - paymentTimes[i - 1];
                gaps.push(gap);
                totalGap += gap;
              }

              const avgGap: number = totalGap / gaps.length;

              // Calculate standard deviation of gaps
              const variance: number =
                gaps.reduce((sum, gap) => sum + Math.pow(gap - avgGap, 2), 0) /
                gaps.length;
              const stdDev: number = Math.sqrt(variance);

              // Coefficient of variation (lower = more consistent)
              const cv: number = stdDev / avgGap;

              // Apply consistency bonus (inverse of coefficient of variation)
              // More consistent payment patterns get higher bonus
              const consistencyBonus: number = 1 / (1 + cv);

              // Apply bonus, but cap it at the configured bonus factor
              const activityMultiplier: number =
                1 + Math.min(consistencyBonus, parseFloat(activityBonus) - 1);
              score *= activityMultiplier;
            }
          }

          return {
            trackId: track.trackId,
            score,
            totalAmount: track.totalAmount,
            uniqueSupporters: track.uniqueSupporters.size,
            paymentCount: track.payments.length,
            latestPayment: track.latestPayment,
          };
        });

      // Sort tracks by score (descending)
      tracksWithScores.sort((a, b) => b.score - a.score);

      // Normalize scores if enabled
      if (normalizeScores === "true" || normalizeScores === true) {
        if (tracksWithScores.length > 0) {
          const maxScore: number = tracksWithScores[0].score;
          tracksWithScores.forEach((track) => {
            track.normalizedScore = (track.score / maxScore) * 100;
          });
        }
      }

      // Get top tracks based on limit
      const topTracks: TrackScore[] = tracksWithScores.slice(
        0,
        parseInt(limit)
      );

      // Fetch full track info for the top tracks
      const trackIds: string[] = topTracks.map((track) => track.trackId);

      // Query for full track info
      const tracksInfo = await prisma.trackInfo.findMany({
        where: {
          id: { in: trackIds },
        },
        select: {
          id: true,
          title: true,
          artist: true,
          artistUrl: true,
          avatarUrl: true,
          userId: true,
          artworkUrl: true,
          albumTitle: true,
          liveUrl: true,
          duration: true,
          albumId: true,
          artistId: true,
          msatTotal: true,
          genreId: true,
        },
      });

      // Merge track info with scores
      const result: TrackResult[] = tracksInfo.map((trackInfo) => {
        const scoreInfo = topTracks.find(
          (t) => t.trackId === trackInfo.id
        ) as TrackScore;
        return {
          ...trackInfo,
          score: scoreInfo.score,
          normalizedScore: scoreInfo.normalizedScore,
          uniqueSupporters: scoreInfo.uniqueSupporters,
          paymentCount: scoreInfo.paymentCount,
          recentActivityScore:
            scoreInfo.score / (Number(trackInfo.msatTotal) || 1),
        };
      });

      // Sort by score again (in case the order changed during join)
      result.sort((a, b) => b.score - a.score);

      // Add OP3 URL prefix to liveUrl
      result.forEach((track) => {
        track.liveUrl = addOP3URLPrefix({
          url: track.liveUrl || "",
          albumId: track.albumId || "",
        });
      });

      // Return the final result
      res.json({
        success: true,
        data: result,
        meta: {
          timeWindow,
          customDays:
            timeWindow === "custom" ? parseInt(customDays as string) : null,
          startDate,
          weights: {
            amount: parseFloat(weightAmount),
            recency: parseFloat(weightRecency),
            uniqueSupporters: parseFloat(weightUniqueSupporters),
            keysend: parseFloat(weightKeysend),
          },
        },
      } as APIResponse);
    } catch (error) {
      log.error("Error in beta_top_forty:", error);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

export default {
  get_top_forty,
  get_custom_chart,
  get_beta_top_forty,
};

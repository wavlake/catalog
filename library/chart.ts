import { addOP3URLPrefix } from "./op3";
import prisma from "../prisma/client";
import db from "../library/db";
const log = require("loglevel");

export const getWeeklyTop40 = async () => {
  const tracks = await prisma.trackInfo.findMany({
    where: {
      isDraft: false,
      publishedAt: { lte: new Date() },
      msatTotal7Days: { gt: 0 },
    },
    orderBy: { msatTotal7Days: "desc" },
    take: 40,
  });

  // Add OP3 URL prefix to liveUrl
  const tracksWithOp3 = tracks.map((track) => {
    return {
      ...track,
      liveUrl: addOP3URLPrefix({
        url: track.liveUrl,
        albumId: track.albumId,
      }),
    };
  });

  return tracksWithOp3;
};

export interface ChartQueryParams {
  timeWindow?: string;
  limit?: string;
  weightAmount?: string;
  weightRecency?: string;
  weightUniqueSupporters?: string;
  recencyDecay?: string;
  decayHalfLife?: string;
  minPayments?: string;
  applyActivityBonus?: string | boolean;
  activityBonus?: string;
  normalizeScores?: string | boolean;
  customDays?: string;
}

export interface Payment {
  trackId: string;
  satAmount: number;
  createdAt: Date;
  pubkey?: string;
}

export interface TrackPaymentData {
  trackId: string;
  payments: Payment[];
  uniqueSupporters: Set<string>;
  totalAmount: number;
  latestPayment: number;
}

export interface TrackScore {
  trackId: string;
  score: number;
  normalizedScore?: number;
  totalAmount: number;
  uniqueSupporters: number;
  paymentCount: number;
  latestPayment: number;
}

export interface TrackResult {
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

export interface ChartResult {
  success: boolean;
  data?: TrackResult[];
  error?: string;
  meta?: Record<string, any>;
}

/**
 * Validates the time window parameters and returns the time window in milliseconds
 */
export function validateTimeWindow(
  timeWindow: string = "week",
  customDays?: string
): { valid: boolean; timeWindowMs?: number; error?: string } {
  const validTimeWindows = ["day", "week", "month", "custom"];

  if (!validTimeWindows.includes(timeWindow)) {
    return {
      valid: false,
      error: "Invalid timeWindow, must be one of: day, week, month, custom",
    };
  }

  // If custom timeWindow, validate customDays
  if (timeWindow === "custom") {
    if (
      !customDays ||
      isNaN(parseInt(customDays)) ||
      parseInt(customDays) <= 0 ||
      parseInt(customDays) > 90
    ) {
      return {
        valid: false,
        error:
          "For custom timeWindow, customDays must be a number between 1 and 90",
      };
    }
    return {
      valid: true,
      timeWindowMs: parseInt(customDays) * 24 * 60 * 60 * 1000,
    };
  } else {
    // Set time window in milliseconds based on parameter
    const timeWindowMap: Record<string, number> = {
      day: 1 * 24 * 60 * 60 * 1000, // 1 day
      week: 7 * 24 * 60 * 60 * 1000, // 7 days
      month: 30 * 24 * 60 * 60 * 1000, // 30 days
    };
    return {
      valid: true,
      timeWindowMs: timeWindowMap[timeWindow],
    };
  }
}

/**
 * Fetches payments within the given time window
 */
export async function fetchPaymentsInTimeWindow(
  startDate: Date
): Promise<Payment[]> {
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

  return payments;
}

/**
 * Groups payments by track ID
 */
export function groupPaymentsByTrack(
  payments: Payment[]
): Record<string, TrackPaymentData> {
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

  return trackPayments;
}

/**
 * Calculates scores for tracks based on the provided parameters
 */
export function calculateTrackScores(
  trackPayments: Record<string, TrackPaymentData>,
  params: ChartQueryParams,
  currentTime: Date,
  timeWindowMs: number
): TrackScore[] {
  const {
    weightAmount = "1.0",
    weightRecency = "0.5",
    weightUniqueSupporters = "2.0",
    recencyDecay = "exponential",
    decayHalfLife = "3",
    minPayments = "3",
    applyActivityBonus = true,
    activityBonus = "1.2",
  } = params;

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
      score += track.uniqueSupporters.size * parseFloat(weightUniqueSupporters);

      // Apply activity bonus if enabled
      if (applyActivityBonus === "true" || applyActivityBonus === true) {
        score = applyActivityBonusToScore(score, track.payments, activityBonus);
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

  return tracksWithScores;
}

/**
 * Applies an activity bonus to a track's score based on payment consistency
 */
function applyActivityBonusToScore(
  score: number,
  payments: Payment[],
  activityBonus: string
): number {
  // Calculate consistency of payments over time
  const paymentTimes: number[] = payments
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

    return score * activityMultiplier;
  }

  return score;
}

/**
 * Normalizes scores if enabled
 */
export function normalizeScores(
  tracksWithScores: TrackScore[],
  normalizeScores: string | boolean = true
): TrackScore[] {
  if (normalizeScores === "true" || normalizeScores === true) {
    if (tracksWithScores.length > 0) {
      const maxScore: number = tracksWithScores[0].score;
      tracksWithScores.forEach((track) => {
        track.normalizedScore = (track.score / maxScore) * 100;
      });
    }
  }

  return tracksWithScores;
}

/**
 * Fetches track information for the top tracks
 */
export async function fetchTrackInfo(trackIds: string[]): Promise<any[]> {
  return await prisma.trackInfo.findMany({
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
}

/**
 * Merges track info with scores and adds OP3 URL prefix
 */
export function mergeTrackInfoWithScores(
  tracksInfo: any[],
  topTracks: TrackScore[]
): TrackResult[] {
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
      recentActivityScore: scoreInfo.score / (Number(trackInfo.msatTotal) || 1),
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

  return result;
}

/**
 * Main function to generate chart data based on query parameters
 */
export async function generateChartData(
  params: ChartQueryParams
): Promise<ChartResult> {
  try {
    const {
      timeWindow = "week",
      limit = "40",
      normalizeScores: normalizeScoresParam = true,
      customDays,
    } = params;

    // Validate time window
    const timeWindowValidation = validateTimeWindow(timeWindow, customDays);
    if (!timeWindowValidation.valid) {
      return {
        success: false,
        error: timeWindowValidation.error,
      };
    }

    const timeWindowMs = timeWindowValidation.timeWindowMs;

    // Calculate start date based on time window
    const currentTime = new Date();
    const startDate = new Date(currentTime.getTime() - timeWindowMs);

    // Fetch payments within the time window
    const payments = await fetchPaymentsInTimeWindow(startDate);

    // If no payments found, return empty array
    if (!payments.length) {
      return { success: true, data: [] };
    }

    // Group payments by trackId
    const trackPayments = groupPaymentsByTrack(payments);

    // Calculate scores for each track
    let tracksWithScores = calculateTrackScores(
      trackPayments,
      params,
      currentTime,
      timeWindowMs
    );

    // Normalize scores if enabled
    tracksWithScores = normalizeScores(tracksWithScores, normalizeScoresParam);

    // Get top tracks based on limit
    const topTracks: TrackScore[] = tracksWithScores.slice(0, parseInt(limit));

    // Fetch full track info for the top tracks
    const trackIds: string[] = topTracks.map((track) => track.trackId);
    const tracksInfo = await fetchTrackInfo(trackIds);

    // Merge track info with scores
    const result = mergeTrackInfoWithScores(tracksInfo, topTracks);

    // Return the final result
    return {
      success: true,
      data: result,
      meta: {
        timeWindow,
        customDays: timeWindow === "custom" ? parseInt(customDays) : null,
        startDate,
        weights: {
          amount: parseFloat(params.weightAmount || "1.0"),
          recency: parseFloat(params.weightRecency || "0.5"),
          uniqueSupporters: parseFloat(params.weightUniqueSupporters || "2.0"),
        },
      },
    };
  } catch (error) {
    log.error("Error in generateChartData:", error);
    return { success: false, error: "Internal server error" };
  }
}

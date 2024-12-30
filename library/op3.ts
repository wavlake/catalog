import { OP3_PREFIX, podcastNamespace, feedPath } from "./rssUtils";
const { v5 } = require("uuid");
import axios, { AxiosError } from "axios";
import { getType, getReleaseTitle } from "./content";
import log from "./winston";

// Constants
const OP3_API = "https://op3.dev/api/1";
const OP3_KEY = process.env.OP3_KEY;
const RESULTS_LIMIT = 1000;
const PAGINATION_LIMIT = 2;
const RATE_LIMIT_MS = 1000;

// Types
interface IParams {
  url: string;
  albumId?: string;
  podcastId?: string;
}

interface OP3Response {
  results: any[];
  continuationToken?: string;
}

interface OP3ShowInfo {
  showUuid: string;
  episodes: Array<{
    id: string;
    title: string;
    itemGuid: string;
  }>;
  statsPageUrl: string;
}

interface OP3Stats {
  rows: Array<{
    episodeId: string;
    title?: string;
    itemGuid?: string;
  }>;
  statsPageUrl?: string;
  releaseTitle?: string;
}

// API client setup
const op3Client = axios.create({
  baseURL: OP3_API,
  headers: {
    Authorization: `Bearer ${OP3_KEY}`,
    "Content-Type": "application/json",
  },
});

// Utility functions
const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Error handling utilities
const handleOP3Error = (error: unknown, context: string): never => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    log.error(`OP3 API Error in ${context}:`, {
      status: axiosError.response?.status,
      message: axiosError.message,
      url: axiosError.config?.url,
      response: axiosError.response?.data,
    });
    throw new Error(`OP3 API error in ${context}: ${axiosError.message}`);
  }
  log.error(`Unexpected error in ${context}:`, { error });
  throw error;
};

// Rate limited axios request with error handling
const rateLimit = async <T>(
  fn: () => Promise<T>,
  context: string
): Promise<T> => {
  try {
    const result = await fn();
    await delay(RATE_LIMIT_MS);
    return result;
  } catch (error) {
    return handleOP3Error(error, context);
  }
};

const buildDateRange = (
  startDate?: string
): { query: string; endDate?: string } => {
  if (!startDate) {
    return { query: "start=-30d&end=-24h" };
  }

  const date = new Date(startDate);
  date.setMonth(date.getMonth() + 1);
  const endDate = date.toISOString();
  return {
    query: `start=${startDate}&end=${endDate}`,
    endDate,
  };
};

// Main functions
export const addOP3URLPrefix = ({
  url,
  albumId,
  podcastId,
}: IParams): string => {
  if (albumId) {
    return `${OP3_PREFIX},pg=${v5(
      feedPath("album", albumId),
      podcastNamespace
    )}/${url}`;
  }
  if (podcastId) {
    return `${OP3_PREFIX},pg=${v5(
      feedPath("podcast", podcastId),
      podcastNamespace
    )}/${url}`;
  }
  throw new Error("Either albumId or podcastId must be provided");
};

export const getContentStats = async (
  contentId: string,
  startDate?: string
): Promise<OP3Stats> => {
  try {
    log.info("Fetching content stats", { contentId, startDate });

    const contentType = await getType(contentId);
    if (contentType !== "album" && contentType !== "podcast") {
      log.error("Invalid content type", { contentId, contentType });
      throw new Error("Invalid content type: must be 'album' or 'podcast'");
    }

    const podcastGuid = v5(feedPath(contentType, contentId), podcastNamespace);
    const op3Id = await getOp3Id(podcastGuid);
    const op3Stats = await getOp3Stats(op3Id, startDate);
    const op3ShowInfo = await getOp3ShowInfo(op3Id);

    const statsWithShowInfo = await mergeShowInfo(op3Stats, op3ShowInfo);
    statsWithShowInfo.statsPageUrl = op3ShowInfo.statsPageUrl;
    statsWithShowInfo.releaseTitle =
      (await getReleaseTitle(contentId, contentType)) || "";

    log.info("Successfully fetched content stats", {
      contentId,
      contentType,
      totalResults: statsWithShowInfo.rows.length,
    });

    return statsWithShowInfo;
  } catch (error) {
    return handleOP3Error(error, "getContentStats");
  }
};

export const mergeShowInfo = async (
  stats: OP3Stats,
  showInfo: OP3ShowInfo
): Promise<OP3Stats> => {
  const episodes = showInfo.episodes;
  const results = stats.rows.map((result) => {
    const episode = episodes.find((episode) => episode.id === result.episodeId);
    return {
      ...result,
      title: episode?.title,
      itemGuid: episode?.itemGuid,
    };
  });

  return { ...stats, rows: results };
};

export const getOp3ShowInfo = async (op3Id: string): Promise<OP3ShowInfo> => {
  const response = await rateLimit(
    () => op3Client.get<OP3ShowInfo>(`/shows/${op3Id}?episodes=include`),
    "getOp3ShowInfo"
  );

  if (!response.data) {
    log.error("No show data found", { op3Id });
    throw new Error("No show found");
  }

  return response.data;
};

export const getOp3Id = async (podcastGuid: string): Promise<string> => {
  const response = await rateLimit(
    () => op3Client.get<OP3ShowInfo>(`/shows/${podcastGuid}`),
    "getOp3Id"
  );

  if (!response.data) {
    log.error("No show data found", { podcastGuid });
    throw new Error("No show found");
  }

  return response.data.showUuid;
};

export const getOp3Stats = async (
  op3Id: string,
  startDate?: string
): Promise<OP3Stats> => {
  try {
    const { query } = buildDateRange(startDate);
    log.info("Fetching OP3 stats", { op3Id, query });

    const response = await rateLimit(
      () =>
        op3Client.get<OP3Response>(
          `/downloads/show/${op3Id}?${query}&format=json&limit=${RESULTS_LIMIT}`
        ),
      "getOp3Stats initial request"
    );

    const results = response.data.results || [];
    let { continuationToken } = response.data;

    // Log pagination progress
    let pageCount = 1;
    while (continuationToken) {
      log.debug(`Fetching paginated results`, {
        op3Id,
        page: ++pageCount,
      });

      const nextResponse = await rateLimit(
        () =>
          op3Client.get<OP3Response>(
            `/downloads/show/${op3Id}?${query}&format=json&limit=${PAGINATION_LIMIT}&continuationToken=${continuationToken}`
          ),
        `getOp3Stats page ${pageCount}`
      );

      results.push(...nextResponse.data.results);
      continuationToken = nextResponse.data.continuationToken;
    }

    log.info("Successfully fetched OP3 stats", {
      op3Id,
      totalResults: results.length,
      pages: pageCount,
    });

    return { rows: results };
  } catch (error) {
    return handleOP3Error(error, "getOp3Stats");
  }
};

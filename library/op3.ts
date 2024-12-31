import { OP3_PREFIX, podcastNamespace, feedPath } from "./rssUtils";
const { v5 } = require("uuid");
import axios, { AxiosError } from "axios";
import { getType } from "./content";
import log from "./winston";

// Constants
const OP3_API = "https://op3.dev/api/1";
const OP3_KEY = process.env.OP3_KEY;
const RESULTS_LIMIT = 20000;
const RATE_LIMIT_MS = 1000;

// Types
interface IParams {
  url: string;
  albumId?: string;
  podcastId?: string;
}

export type DownloadRow = {
  time: string;
  url: string;
  audienceId: string;
  showUuid: string;
  episodeId: string;
  hashedIpAddress: string;
  agentType: string;
  agentName: string;
  deviceType: string;
  deviceName: string;
  countryCode: string;
  continentCode: string;
  regionCode: string;
  regionName: string;
  timezone: string;
  metroCode: string;
  title: string;
  itemGuid: string;
};

interface OP3Response {
  rows: DownloadRow[];
  count: number;
  queryTime: number;
  continuationToken?: string;
}

interface OP3ShowInfo {
  showUuid: string;
  title: string;
  podcastGuid: string;
  statsPageUrl: string;
  episodes: Array<{
    id: string;
    title: string;
    itemGuid: string;
  }>;
}

export type OP3CombinedData = OP3Stats &
  Pick<OP3ShowInfo, "statsPageUrl"> & { releaseTitle: string };
interface OP3Stats {
  rows: DownloadRow[];
  count: number;
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
const handleOP3Error = (error: unknown, context: string) => {
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
    handleOP3Error(error, context);
    return;
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
) => {
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

    log.info("Successfully fetched content stats", {
      contentId,
      contentType,
      totalResults: statsWithShowInfo.rows.length,
    });

    return statsWithShowInfo;
  } catch (error) {
    handleOP3Error(error, "getContentStats");
    return;
  }
};

export const mergeShowInfo = async (
  stats: OP3Stats,
  showInfo: OP3ShowInfo
): Promise<OP3CombinedData> => {
  const episodes = showInfo.episodes;
  const results = stats.rows.map((result) => {
    const episode = episodes.find((episode) => episode.id === result.episodeId);
    return {
      ...result,
      title: episode?.title,
      itemGuid: episode?.itemGuid,
    };
  });

  return {
    ...stats,
    statsPageUrl: showInfo.statsPageUrl,
    releaseTitle: showInfo.title,
    rows: results,
  };
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
    const url = `/downloads/show/${op3Id}?${query}&format=json&limit=${RESULTS_LIMIT}`;
    log.info("Fetching OP3 stats", { op3Id, query, url });

    const response = await rateLimit(
      () => op3Client.get<OP3Response>(url),
      "getOp3Stats initial request"
    );

    if (!response.data) {
      log.error("No data received from OP3 API", { op3Id });
      throw new Error("No data received from OP3 API");
    }

    const results = response.data.rows || [];
    let { continuationToken } = response.data;

    // Log pagination progress
    let pageCount = 1;
    while (continuationToken) {
      const url = `/downloads/show/${op3Id}?${query}&format=json&limit=${RESULTS_LIMIT}&continuationToken=${continuationToken}`;
      log.info(`Fetching paginated results`, {
        op3Id,
        page: ++pageCount,
        url,
      });

      try {
        const nextResponse = await rateLimit(
          () => op3Client.get<OP3Response>(url),
          `getOp3Stats page ${pageCount}`
        );
        if (!nextResponse.data) {
          log.error("No data received from OP3 API during pagination", {
            op3Id,
            page: pageCount,
          });
          break;
        }

        if (!Array.isArray(nextResponse.data.rows)) {
          log.error("Invalid results format received from OP3 API", {
            op3Id,
            page: pageCount,
            actualType: typeof nextResponse.data.rows,
          });
          break;
        }

        results.push(...(nextResponse.data.rows || []));
        continuationToken = nextResponse.data.continuationToken;
      } catch (paginationError) {
        log.error("Error during pagination", {
          op3Id,
          page: pageCount,
          error: paginationError,
        });
        break;
      }
    }

    log.info("Successfully fetched OP3 stats", {
      op3Id,
      totalResults: results.length,
      pages: pageCount,
    });

    return {
      count: results.length,
      rows: results,
    };
  } catch (error) {
    handleOP3Error(error, "getOp3Stats");
    return { rows: [], count: 0 };
  }
};

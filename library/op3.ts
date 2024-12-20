import { OP3_PREFIX, podcastNamespace, feedPath } from "./rssUtils";
const { v5 } = require("uuid");
import axios from "axios";
import { getType, getReleaseTitle } from "./content";

const OP3_API = "https://op3.dev/api/1";
const OP3_KEY = process.env.OP3_KEY;

interface IParams {
  url: string;
  albumId?: string;
  podcastId?: string;
}

const op3Client = axios.create({
  baseURL: OP3_API,
  headers: {
    Authorization: `Bearer ${OP3_KEY}`,
    "Content-Type": "application/json",
  },
});

export const addOP3URLPrefix = ({ url, albumId, podcastId }: IParams) => {
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
};

export const getContentStats = async (
  contentId: string,
  startDate?: string
) => {
  const contentType = await getType(contentId);
  if (contentType != "album" && contentType != "podcast") {
    throw new Error("Invalid content type");
  }
  const podcastGuid = v5(feedPath(contentType, contentId), podcastNamespace);
  const op3Id = await getOp3Id(podcastGuid);
  const op3Stats = await getOp3Stats(op3Id, startDate);
  const op3ShowInfo = await getOp3ShowInfo(op3Id);

  const statsWithShowInfo = await mergeShowInfo(op3Stats, op3ShowInfo);
  statsWithShowInfo.statsPageUrl = op3ShowInfo.statsPageUrl;

  const releaseTitle = await getReleaseTitle(contentId, contentType);
  statsWithShowInfo.releaseTitle = releaseTitle || "";
  return statsWithShowInfo;
};

export const mergeShowInfo = async (stats: any, showInfo: any) => {
  const episodes = showInfo.episodes;
  const results = stats.rows.map((result: any) => {
    const episode = episodes.find((episode: any) => {
      return episode.id === result.episodeId;
    });
    return {
      ...result,
      title: episode.title,
      itemGuid: episode.itemGuid,
    };
  });
  stats.rows = results;
  return stats;
};

export const getOp3ShowInfo = async (op3Id: string) => {
  const response = await op3Client.get(`/shows/${op3Id}?episodes=include`);
  if (!response.data) {
    throw new Error("No show found");
  }
  return response.data;
};

export const getOp3Id = async (podcastGuid: string) => {
  const response = await op3Client.get(`/shows/${podcastGuid}`);
  if (!response.data) {
    throw new Error("No show found");
  }
  return response.data.showUuid;
};

export const getOp3Stats = async (op3Id: string, startDate?: string) => {
  let endDate;
  if (startDate) {
    const date = new Date(startDate);
    // increment date by one month
    date.setMonth(date.getMonth() + 1);
    endDate = date.toISOString();
  }

  // Default query is the last 30 days
  const query = startDate
    ? `start=${startDate}&end=${endDate}`
    : "start=-30d&end=-24h";

  const response = await op3Client.get(
    `/downloads/show/${op3Id}?${query}&format=json&limit=1000`
  );

  // Initialize results array if it doesn't exist
  if (!response.data.results) {
    response.data.results = [];
  }

  // Fetch results until there is no continuationToken in the response
  let continuationToken = response.data.continuationToken;
  while (continuationToken) {
    const nextResponse = await op3Client.get(
      `/downloads/show/${op3Id}?${query}&format=json&limit=2&continuationToken=${continuationToken}`
    );
    response.data.results = response.data.results.concat(
      nextResponse.data.results
    );
    continuationToken = nextResponse.data.continuationToken;
  }
  return response.data;
};

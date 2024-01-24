import asyncHandler from "express-async-handler";
import prisma from "../prisma/client";
import {
  fetchAllFeedInfo,
  fetchPodcastIndexFeedInfo,
} from "../library/podcastIndex/podcastIndex";
import { formatError } from "../library/errors";

const isFulfilled = <T>(
  input: PromiseSettledResult<T>
): input is PromiseFulfilledResult<T> => input.status === "fulfilled";

const get_external_rss_feeds = asyncHandler(async (req, res, next) => {
  try {
    const feedGuids = await prisma.externalFeed.findMany();
    const responses = await Promise.allSettled(
      feedGuids.map(({ guid }) => fetchPodcastIndexFeedInfo(guid))
    );

    const successfulResponses = responses
      .filter(isFulfilled)
      .map((feedRes) => feedRes.value);

    res.send({
      success: true,
      data: successfulResponses
        // filter out any empty feeds
        .filter((feedRes) => !Array.isArray(feedRes.feed))
        // sort by most recent first
        .sort((a, b) => b.feed.lastUpdateTime - a.feed.lastUpdateTime),
    });
  } catch (err) {
    next(err);
  }
});

const get_external_rss_feed = asyncHandler(async (req, res, next) => {
  try {
    const { guid } = req.params;
    if (!guid) {
      const error = formatError(
        400,
        "Request must include a guid as a param (e.g. /feeds/abc-123)"
      );
      next(error);
      return;
    }
    const podcastIndexOrgFeed = await fetchAllFeedInfo(guid);

    if (!podcastIndexOrgFeed) {
      const error = formatError(
        500,
        "Error getting feed, please try again later."
      );
      next(error);
      return;
    }

    res.send({
      success: true,
      data: podcastIndexOrgFeed,
    });
  } catch (err) {
    next(err);
  }
});

export default {
  get_external_rss_feed,
  get_external_rss_feeds,
};

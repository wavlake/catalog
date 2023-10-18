import asyncHandler from "express-async-handler";
import prisma from "../prisma/client";
import { fetchPodcastIndexFeed } from "../library/podcastIndex/podcastIndex";
import { formatError } from "../library/errors";

const get_external_rss_feeds = asyncHandler(async (req, res, next) => {
  try {
    const feedGuids = await prisma.externalFeed.findMany();
    const responses = await Promise.all(
      feedGuids.map(({ guid }) => fetchPodcastIndexFeed(guid))
    );

    res.send({
      success: true,
      data: responses
        // filter out any empty feeds
        .filter((res) => !Array.isArray(res.feed))
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
    const podcastIndexOrgFeed = await fetchPodcastIndexFeed(guid);

    res.send({
      success: true,
      data: podcastIndexOrgFeed,
    });
  } catch (err) {
    next(err);
  }
});

export default { get_external_rss_feed, get_external_rss_feeds };

import asyncHandler from "express-async-handler";
import prisma from "../prisma/client";
import { fetchPodcastFeed } from "../library/podcastIndex/podcastIndex";
import { formatError } from "../library/errors";
import { sanitizer } from "../library/htmlSanitization";

const get_external_rss_feeds = asyncHandler(async (req, res, next) => {
  try {
    const feedGuids = await prisma.externalFeed.findMany();
    const responses = await Promise.all(
      feedGuids.map(({ guid }) => fetchPodcastFeed(guid))
    );

    const sanitizedFeeds = responses.map((res) => {
      return {
        ...res,
        feed: {
          ...res.feed,
          description: sanitizer(res.feed.description),
        },
      };
    });

    res.send({
      success: true,
      data: sanitizedFeeds
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
    const parsedFeed = await fetchPodcastFeed(guid);

    const sanitizedFeed = {
      ...parsedFeed,
      feed: {
        ...parsedFeed.feed,
        description: sanitizer(parsedFeed.feed.description),
      },
    };

    res.send({
      success: true,
      data: sanitizedFeed,
    });
  } catch (err) {
    next(err);
  }
});

export default { get_external_rss_feed, get_external_rss_feeds };

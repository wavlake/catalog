import db from "../library/db";
import asyncHandler from "express-async-handler";
import prisma from "../prisma/client";
import { fetchPodcastFeed } from "../library/podcastIndex/podcastIndex";
import log from "loglevel";

const get_external_rss_feeds = asyncHandler(async (req, res, next) => {
  try {
    const feedGuids = await prisma.externalFeed.findMany();
    const responses = await Promise.all(
      feedGuids.map(({ guid }) => fetchPodcastFeed(guid))
    );

    const emptyFeeds = responses.filter(
      (res) => Array.isArray(res.feed) && res.feed.length === 0
    );

    emptyFeeds.forEach((emptyFeed) => {
      log.warn(
        `Empty feed for guid: ${emptyFeed.query.guid}, verify the guid being used is correct`
      );
    });

    res.send({
      success: true,
      data: responses
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
    // TODO replace first with a call to podcastindex.org to fetch the target feed url and use that
    const targetFeedUrl = await db.knex("external_feed").first();
    const parsedFeed = await fetchPodcastFeed(targetFeedUrl);

    res.send({
      success: true,
      data: parsedFeed,
    });
  } catch (err) {
    next(err);
  }
});

export default { get_external_rss_feed, get_external_rss_feeds };

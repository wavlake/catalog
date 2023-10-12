import db from "../library/db";
import asyncHandler from "express-async-handler";
import prisma from "../prisma/client";
import { fetchPodcastFeed } from "../library/podcastIndex/podcastIndex";

const get_external_rss_feeds = asyncHandler(async (req, res, next) => {
  try {
    const feeds = await prisma.externalFeed.findMany();
    const parsedFeeds = await Promise.all(
      feeds.map(({ guid }) => fetchPodcastFeed(guid))
    );

    res.send({
      success: true,
      data: parsedFeeds,
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

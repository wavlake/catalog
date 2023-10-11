import db from "../library/db";
import asyncHandler from "express-async-handler";
import podcastFeedParser from "@podverse/podcast-feed-parser";

export const fetchAndParseFeed = async ({
  feed_url,
}: {
  feed_url: string;
}): Promise<any> => {
  try {
    const feed = await podcastFeedParser.getPodcastFromURL({ url: feed_url });
    return feed;
  } catch (error) {
    throw new Error(`Error fetching or parsing XML: ${error}`);
  }
};

const get_rss_feeds = asyncHandler(async (req, res, next) => {
  try {
    // limit to first 10 feeds to display on homepage
    const feeds = await db.knex("external_feed").limit(10);
    const parsedFeeds = await Promise.all(feeds.map(fetchAndParseFeed));

    res.send({
      success: true,
      data: parsedFeeds,
    });
  } catch (err) {
    next(err);
  }
});

export default { get_rss_feeds };

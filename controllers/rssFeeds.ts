import db from "../library/db";
import asyncHandler from "express-async-handler";
import Parser from "rss-parser";

type CustomFeed = {
  title?: string;
  description?: string;
  author?: string;
  episodes?: string;
};

type CustomItem = { bar: number };
const parser: Parser<CustomFeed, CustomItem> = new Parser({
  customFields: {
    //   feed: ["baz"],
    //   //            ^ will error because `baz` is not a key of CustomFeed
    //   item: ["bar"],
  },
});

export const fetchAndParseFeed = async ({
  feed_url,
}: {
  feed_url: string;
}): Promise<any> => {
  try {
    const feed = await parser.parseURL(feed_url);

    return feed;
  } catch (error) {
    throw new Error(`Error fetching or parsing XML: ${error}`);
  }
};

const get_rss_feeds = asyncHandler(async (req, res, next) => {
  try {
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

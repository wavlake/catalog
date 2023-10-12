import db from "../library/db";
import asyncHandler from "express-async-handler";
import podcastFeedParser from "@podverse/podcast-feed-parser";

export const fetchAndParseFeed = async ({
  feed_url,
}: {
  feed_url: string;
}): Promise<Feed> => {
  try {
    const feed: Feed = await podcastFeedParser.getPodcastFromURL({
      url: feed_url,
    });
    return feed;
  } catch (error) {
    throw new Error(`Error fetching or parsing XML: ${error}`);
  }
};

const get_external_rss_feeds = asyncHandler(async (req, res, next) => {
  try {
    const feeds = await db.knex("external_feed");
    const parsedFeeds = await Promise.all(feeds.map(fetchAndParseFeed));

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
    const parsedFeed = await fetchAndParseFeed(targetFeedUrl);

    res.send({
      success: true,
      data: parsedFeed,
    });
  } catch (err) {
    next(err);
  }
});

export default { get_external_rss_feed, get_external_rss_feeds };

type Transcript = {
  language: string;
  rel: string;
  type: string;
  url: string;
};
type Value = {
  method: string;
  suggested: string;
  type: string;
  recipients: any[];
};

type Owner = {
  name: string;
  email: string;
};

type Meta = {
  author: string[];
  blocked: any;
  categories: string[];
  complete: any;
  description: string;
  docs: any;
  editor: string;
  explicit: any;
  funding: any[];
  generator: string;
  guid: any;
  imageURL: string;
  keywords: string;
  language: string;
  lastBuildDate: string;
  link: string;
  locked: any;
  pubDate: string;
  owner: Owner;
  subtitle: any;
  summary: any;
  title: string;
  type: any;
  value: Value[];
  webMaster: any;
};

type FeedEpisode = {
  author: string[];
  blocked: any;
  chapters: {
    type: string;
    url: string;
  };
  description: string;
  duration: number;
  enclosure: {
    length: string;
    type: string;
    url: string;
  };
  explicit: boolean;
  funding: any[];
  guid: string;
  imageURL: string;
  keywords: string;
  language: string;
  link: string;
  order: any;
  pubDate: string;
  soundbite: [];
  subtitle: string;
  summary: string;
  title: string;
  transcript: Transcript[];
  value: Value[];
};

type Feed = {
  meta: Meta;
  episodes: FeedEpisode[];
};

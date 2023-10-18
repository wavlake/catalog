import { sanitize } from "./../library/htmlSanitization";
import asyncHandler from "express-async-handler";
import prisma from "../prisma/client";
import { fetchPodcastIndexFeed } from "../library/podcastIndex/podcastIndex";
import { formatError } from "../library/errors";
import { getPodcastFromURL } from "@podverse/podcast-feed-parser";

const get_external_rss_feeds = asyncHandler(async (req, res, next) => {
  try {
    const feedGuids = await prisma.externalFeed.findMany();
    const responses = await Promise.all(
      feedGuids.map(({ guid }) => fetchPodcastIndexFeed(guid))
    );

    const timeSplitData = await Promise.all(
      responses.map(({ feed }) =>
        getPodcastFromURL({
          url: feed.url,
        })
      )
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

    // this parser uses the raw RSS feed
    const rawFeed = await getPodcastFromURL({
      url: podcastIndexOrgFeed.feed.url,
    });

    const response = {
      ...podcastIndexOrgFeed,
      episodes: {
        ...podcastIndexOrgFeed.episodes,
        items: podcastIndexOrgFeed.episodes.items.map((episode, index) => ({
          ...episode,
          // overwrite the description with the one from the raw feed
          // podcastindex.org truncates this
          description: sanitize(rawFeed.episodes[index]?.description),
          // manually add in time splits because podcastindex doesn't yet support them
          valueTimeSplits:
            rawFeed.episodes[index]?.value?.[0]?.timeSplits ?? [],
        })),
      },
    };
    res.send({
      success: true,
      data: response,
    });
  } catch (err) {
    next(err);
  }
});

export default { get_external_rss_feed, get_external_rss_feeds };

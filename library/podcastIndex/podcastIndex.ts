import podcastIndex from "podcast-index-api";
import { PodcastIndexPodcastEpisodes, PodcastIndexPodcast } from "./types";
import log from "loglevel";
import { sanitize } from "../htmlSanitization";
import { getPodcastFromURL } from "@podverse/podcast-feed-parser";

const { PODCAST_INDEX_KEY, PODCAST_INDEX_SECRET } = process.env;
const podcastIndexApi = podcastIndex(PODCAST_INDEX_KEY, PODCAST_INDEX_SECRET);

// this makes a call to podcastindex.org and also to the RSS feed url to get the timesplit data and full description
export const fetchAllFeedInfo = async (guid: string) => {
  try {
    const podcast: PodcastIndexPodcast = await podcastIndexApi.podcastsByGUID(
      guid
    );

    if (Array.isArray(podcast.feed) && podcast.feed.length === 0) {
      log.warn(
        `Empty feed for guid: ${podcast.query.guid}, verify the guid being used is correct`
      );
    }
    const [rawFeed, episodesUntyped] = await Promise.all([
      // this parser grabs the raw RSS feed contents
      getPodcastFromURL({
        url: podcast.feed.url,
      }),
      podcastIndexApi.episodesByFeedId(podcast.feed.id),
    ]).catch((err) => {
      throw err;
    });

    const episodes: PodcastIndexPodcastEpisodes = episodesUntyped;
    // description cannot be undefined, so we need to define it here and then add it to the object
    const description = sanitize(podcast.feed.description);
    const sanitizedFeed = {
      ...podcast,
      feed: {
        ...podcast.feed,
        description,
      },
      episodes: {
        ...episodes,
        items: episodes.items.map((episode, index) => {
          const matchedEpisode = rawFeed?.episodes?.find(
            (rawFeedEpisode) => rawFeedEpisode.guid === episode.guid
          );
          const valueTimeSplits = matchedEpisode
            ? matchedEpisode.value?.[0]?.timeSplits
            : [];
          const description = sanitize(matchedEpisode?.description);
          return {
            ...episode,
            // overwrite the description with the one from the raw feed
            // podcastindex.org truncates this
            description,
            // manually add in time splits because podcastindex doesn't yet support them
            valueTimeSplits,
          };
        }),
        liveItems: episodes.liveItems.map((liveItem) => {
          const description = sanitize(liveItem.description);
          return {
            ...liveItem,
            description,
          };
        }),
      },
    };

    return sanitizedFeed;
  } catch (err) {
    log.error(`Error fetching podcast index feed: ${err}`);
    throw err;
  }
};

// this only makes a call to podcastindex.org using the podcast-index-api package
export const fetchPodcastIndexFeedInfo = async (guid: string) => {
  try {
    const podcast: PodcastIndexPodcast = await podcastIndexApi.podcastsByGUID(
      guid
    );

    if (Array.isArray(podcast.feed) && podcast.feed.length === 0) {
      log.warn(
        `Empty feed for guid: ${podcast.query.guid}, verify the guid being used is correct`
      );
    }
    const episodesUntyped = await podcastIndexApi.episodesByFeedId(
      podcast.feed.id
    );

    const episodes: PodcastIndexPodcastEpisodes = episodesUntyped;
    // description cannot be undefined, so we need to define it here and then add it to the object
    const description = sanitize(podcast.feed.description);

    const sanitizedFeed = {
      ...podcast,
      feed: {
        ...podcast.feed,
        description,
      },
      episodes: {
        ...episodes,
        liveItems: episodes.liveItems.map((liveItem) => {
          const description = sanitize(liveItem.description);
          return {
            ...liveItem,
            description,
          };
        }),
      },
    };

    return sanitizedFeed;
  } catch (err) {
    log.error(`Error fetching podcast index feed: ${err}`);
    throw err;
  }
};

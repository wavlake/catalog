import podcastIndex from "podcast-index-api";
import { PodcastIndexPodcastEpisodes, PodcastIndexPodcast } from "./types";
import log from "loglevel";
import { sanitize } from "../htmlSanitization";
import { getPodcastFromURL } from "@podverse/podcast-feed-parser";

const { PODCAST_INDEX_KEY, PODCAST_INDEX_SECRET } = process.env;
const podcastIndexApi = podcastIndex(PODCAST_INDEX_KEY, PODCAST_INDEX_SECRET);

export const fetchPodcastIndexFeed = async (guid: string) => {
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
  ]);

  const episodes: PodcastIndexPodcastEpisodes = episodesUntyped;

  const sanitizedFeed = {
    ...podcast,
    feed: {
      ...podcast.feed,
      description: sanitize(podcast.feed.description),
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

        return {
          ...episode,
          // overwrite the description with the one from the raw feed
          // podcastindex.org truncates this
          description: sanitize(matchedEpisode?.description),
          // manually add in time splits because podcastindex doesn't yet support them
          valueTimeSplits,
        };
      }),
      liveItems: episodes.liveItems.map((liveItem) => {
        return {
          ...liveItem,
          description: sanitize(liveItem.description),
        };
      }),
    },
  };

  return sanitizedFeed;
};

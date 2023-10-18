import podcastIndex from "podcast-index-api";
import { PodcastIndexPodcastEpisodes, PodcastIndexPodcast } from "./types";
import log from "loglevel";

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

  const episodes: PodcastIndexPodcastEpisodes =
    await podcastIndexApi.episodesByFeedId(podcast.feed.id);

  return {
    ...podcast,
    episodes,
  };
};

import podcastIndex from "podcast-index-api";
import { PodcastIndexResponse } from "./types";

const { PODCAST_INDEX_KEY, PODCAST_INDEX_SECRET } = process.env;
const podcastIndexApi = podcastIndex(PODCAST_INDEX_KEY, PODCAST_INDEX_SECRET);

export const fetchPodcastFeed = async (guid: string) => {
  const podcast: PodcastIndexResponse = await podcastIndexApi.podcastsByGUID(
    guid
  );
  return podcast.feed.url;
};

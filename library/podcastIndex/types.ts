export interface PodcastIndexResponse {
  status: string;
  query: {
    guid: string;
    id: number;
  };
  feed: Feed;
  description: string;
}

interface Feed {
  id: number;
  podcastGuid: string;
  medium: string;
  title: string;
  url: string;
  originalUrl: string;
  link: string;
  description: string;
  author: string;
  ownerName: string;
  image: string;
  artwork: string;
  lastUpdateTime: number;
  lastCrawlTime: number;
  lastParseTime: number;
  lastGoodHttpStatusTime: number;
  lastHttpStatus: number;
  contentType: string;
  itunesId: number | null;
  itunesType: string;
  generator: string;
  language: string;
  explicit: boolean;
  type: number;
  dead: number;
  chash: string;
  episodeCount: number;
  crawlErrors: number;
  parseErrors: number;
  categories: null; // You might want to replace this with the actual type if available
  locked: number;
  imageUrlHash: number;
  value: Value;
}

interface Destination {
  name: string;
  type: string;
  address: string;
  split: number;
  customKey?: string;
  customValue?: string;
  fee?: boolean;
}

interface Value {
  model: {
    type: string;
    method: string;
    suggested: string;
  };
  destinations: Destination[];
}

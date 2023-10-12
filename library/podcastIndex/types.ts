export interface PodcastIndexPodcast {
  status: string;
  query: {
    guid: string;
    id: number;
  };
  // if there is no podcast found, this will be an empty array
  feed: Feed;
  description: string;
}

export interface PodcastIndexPodcastEpisodes {
  count: number;
  description: string;
  items: Episode[];
  liveItems: LiveItem[];
  query: string;
  status: string;
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
  categories: null;
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

interface Person {
  id: number;
  name: string;
  role: string;
  group: string;
  href: string;
  img: string;
}

interface Transcript {
  url: string;
  type: string;
}

interface Destination {
  name: string;
  type: string;
  address: string;
  split: number;
  customKey?: string;
  customValue?: string;
}

interface Value {
  model: {
    type: string;
    method: string;
    suggested: string;
  };
  destinations: Destination[];
}

interface Episode {
  id: number;
  title: string;
  link: string;
  description: string;
  guid: string;
  datePublished: number;
  datePublishedPretty: string;
  dateCrawled: number;
  enclosureUrl: string;
  enclosureType: string;
  enclosureLength: number;
  duration: number;
  explicit: number;
  episode: any;
  episodeType: string;
  season: number;
  image: string;
  feedItunesId: number;
  feedImage: string;
  feedId: number;
  feedLanguage: string;
  feedDead: number;
  feedDuplicateOf: any;
  chaptersUrl: string;
  transcriptUrl: string;
  persons: Person[];
  transcripts: Transcript[];
  value: Value;
}

interface LiveItem {
  id: number;
  title: string;
  link: string;
  description: string;
  guid: string;
  datePublished: number;
  datePublishedPretty: string;
  dateCrawled: number;
  enclosureUrl: string;
  enclosureType: string;
  enclosureLength: number;
  startTime: number;
  endTime: number;
  status: string;
  contentLink: string;
  duration: null | number;
  explicit: number;
  episode: null | any;
  episodeType: null | string;
  season: null | number;
  image: string;
  feedItunesId: number;
  feedImage: string;
  feedId: number;
  feedLanguage: string;
  feedDead: number;
  feedDuplicateOf: null | any;
  chaptersUrl: null | string;
  transcriptUrl: null | string;
}

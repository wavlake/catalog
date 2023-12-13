require("dotenv").config();
const log = require("loglevel");
log.setLevel(process.env.LOGLEVEL);
import podcastIndex from "podcast-index-api";
import prisma from "@prismalocal/client";
const crypto = require("crypto");

const lookbackSeconds = parseInt(process.env.LOOKBACK_MINUTES) * 60 * 1000;
const FEED_URL = "https://wavlake.com/feed/";

const { PODCAST_INDEX_KEY, PODCAST_INDEX_SECRET } = process.env;
const podcastIndexApi = podcastIndex(PODCAST_INDEX_KEY, PODCAST_INDEX_SECRET);

const wavlakePodcastsForUpdate = async () => {
  log.debug("fetching new episodes");
  const newEpisodes = await prisma.episode.findMany({
    where: {
      createdAt: {
        // greater than now - lookbackMinutes
        gt: new Date(Date.now() - lookbackSeconds),
      },
      publishedAt: {
        // less than now
        lt: new Date(Date.now()),
      },
    },
    include: {
      podcast: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  log.debug(newEpisodes);

  return newEpisodes;
};

const publishFeeds = async () => {
  const newEpisodes = await wavlakePodcastsForUpdate();

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (const episode of newEpisodes) {
    await sleep(2000); // sleep 2 seconds between each publish to prevent rate limiting
    const { podcast } = episode;
    const { id } = podcast;
    const feedUrl = `${FEED_URL}${id}`;

    // chash = md5(title+link+feedLanguage+generator+author+ownerName+ownerEmail)
    const attributeString = `${podcast.name}${feedUrl}en-usWavLakeWavLakeWavLake`;
    // md5 hash of attributeString
    const chash = crypto
      .createHash("md5")
      .update(attributeString)
      .digest("hex");

    log.debug(`publishing ${feedUrl}`);
    podcastIndexApi
      .addByFeedUrl(feedUrl, chash)
      .then((res) => {
        log.debug(res);
      })
      .catch((err) => {
        log.error(err);
      });
  }
};

publishFeeds();

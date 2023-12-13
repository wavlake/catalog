require("dotenv").config();
const log = require("loglevel");
log.setLevel(process.env.LOGLEVEL);
import podcastIndex from "podcast-index-api";
import prisma from "@prismalocal/client";
const crypto = require("crypto");

const lookbackSeconds = parseInt(process.env.LOOKBACK_MINUTES) * 60 * 1000;
const FEED_URL = "https://wavlake.com/feed/show/";

const { PODCAST_INDEX_KEY, PODCAST_INDEX_SECRET } = process.env;
const podcastIndexApi = podcastIndex(PODCAST_INDEX_KEY, PODCAST_INDEX_SECRET);

// TODO: Add music feeds

const wavlakePodcastsForUpdate = async () => {
  log.debug("fetching podcasts with new episodes");
  const updatedPodcasts = await prisma.podcast.findMany({
    where: {
      updatedAt: {
        // greater than now - lookbackMinutes
        gt: new Date(Date.now() - lookbackSeconds),
      },
    },
    select: {
      id: true,
      name: true,
    },
  });

  return updatedPodcasts;
};

const publishFeeds = async () => {
  const updatedPodcasts = await wavlakePodcastsForUpdate();

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (const podcast of updatedPodcasts) {
    await sleep(2000); // sleep 2 seconds between each publish to prevent rate limiting
    const { id, name } = podcast;
    const feedUrl = `${FEED_URL}${id}`;

    // TODO: add more attributes to chash
    // chash = md5(title+link+feedLanguage+generator+author+ownerName+ownerEmail)
    const attributeString = `${name}${feedUrl}en-usWavlakeWavlakeWavlakecontact@wavlake.com`;
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

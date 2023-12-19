require("dotenv").config();
const log = require("loglevel");
log.setLevel(process.env.LOGLEVEL);
import podcastIndex from "podcast-index-api";
import prisma from "@prismalocal/client";
const crypto = require("crypto");

const lookbackSeconds = parseInt(process.env.LOOKBACK_MINUTES) * 60 * 1000;
const FEED_URL = "https://www.wavlake.com/feed";

const { PODCAST_INDEX_KEY, PODCAST_INDEX_SECRET } = process.env;
const podcastIndexApi = podcastIndex(PODCAST_INDEX_KEY, PODCAST_INDEX_SECRET);

const lookbackDt = Date.now() - lookbackSeconds;

const wavlakePodcastsForUpdate = async () => {
  const updatedPodcasts = await prisma.podcast.findMany({
    where: {
      updatedAt: {
        // greater than now - lookbackMinutes
        gt: new Date(lookbackDt),
      },
    },
    select: {
      id: true,
      name: true,
      updatedAt: true,
    },
    take: 0,
  });

  return updatedPodcasts.map((podcast) => {
    const { id, name, updatedAt } = podcast;
    const feedUrl = `${FEED_URL}/show/${id}`;
    return { name, feedUrl, updatedAt };
  });
};

const wavlakeMusicFeedsForUpdate = async () => {
  const updatedMusicFeeds = await prisma.album.findMany({
    where: {
      updatedAt: {
        // greater than now - lookbackMinutes
        gt: new Date(lookbackDt),
      },
      deleted: false,
      track: {
        some: {
          // Returns all records where one or more ("some") related records match filtering criteria.
          // In English: return all albums with at least one live, undeleted track
          deleted: false,
        },
      },
    },
    include: { track: true },
    orderBy: { updatedAt: "asc" },
    take: 500,
  });

  return updatedMusicFeeds.map((musicFeed) => {
    const { id, title, updatedAt } = musicFeed;
    const feedUrl = `${FEED_URL}/${id}`;
    return { name: title, feedUrl, updatedAt };
  });
};

const publishFeeds = async () => {
  const updatedPodcasts = await wavlakePodcastsForUpdate();
  const updatedMusicFeeds = await wavlakeMusicFeedsForUpdate();

  const updatedFeeds = [...updatedPodcasts, ...updatedMusicFeeds];

  // log.debug("last item");
  // log.debug(updatedFeeds[updatedFeeds.length - 1]);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (const feedItem of updatedFeeds) {
    await sleep(7000); // sleep 2 seconds between each publish to prevent rate limiting
    const { name, feedUrl } = feedItem;

    // TODO: add more attributes to chash
    // chash = md5(title+link+feedLanguage+generator+author+ownerName+ownerEmail)
    const attributeString = `${name}${feedUrl}en-usWavlakeWavlakeWavlakecontact@wavlake.com`;
    // md5 hash of attributeString
    const chash = crypto
      .createHash("md5")
      .update(attributeString)
      .digest("hex");

    log.debug(`checking: ${name}`);
    const response = await podcastIndexApi
      .podcastsByFeedUrl(feedUrl)
      .catch((e) => {
        log.error(e);
        return { status: "false" };
      });

    // log.debug(response);
    if (response.status === "true") {
      log.debug("feed already exists, notifying hub");
      const { feed } = response;
      const { id } = feed;
      const { status } = await podcastIndexApi.hubPubNotifyById(id);
      log.debug(`Update status: ${status}`);
    } else {
      log.debug("feed does not exist, adding");
      const addResponse = await podcastIndexApi.addByFeedUrl(feedUrl, chash);
      log.debug(addResponse);
    }
  }
};

publishFeeds();

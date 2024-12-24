require("dotenv").config();
const log = require("loglevel");
log.setLevel(process.env.LOGLEVEL);
import podcastIndex from "podcast-index-api";
import prisma from "@prismalocal/client";
const crypto = require("crypto");

const FEED_URL = "https://www.wavlake.com/feed";

const { PODCAST_INDEX_KEY, PODCAST_INDEX_SECRET, PODCAST_INDEX_UA } =
  process.env;
const podcastIndexApi = podcastIndex(
  PODCAST_INDEX_KEY,
  PODCAST_INDEX_SECRET,
  PODCAST_INDEX_UA
);

const updateFeedStatus = async (content: any) => {
  log.info(`Updating feed status for ${content.id}`);
  if (content.track) {
    await prisma.album.update({
      where: { id: content.id },
      data: { isFeedPublished: true },
    });
    return;
  }
  await prisma.podcast.update({
    where: { id: content.id },
    data: { isFeedPublished: true },
  });
  return;
};

const wavlakePodcastsForUpdate = async () => {
  const updatedPodcasts = await prisma.podcast.findMany({
    where: {
      isFeedPublished: false,
      isDraft: false,
      episode: {
        some: {
          // Returns all records where one or more ("some") related records match filtering criteria.
          // In English: return all albums with at least one live, undeleted episode
          deleted: false,
          isProcessing: false,
        },
      },
    },
    select: {
      id: true,
      name: true,
      updatedAt: true,
    },
  });

  return updatedPodcasts.map((podcast) => {
    const { id, name, updatedAt } = podcast;
    const feedUrl = `${FEED_URL}/show/${id}`;
    return { id, name, feedUrl, updatedAt };
  });
};

const wavlakeMusicFeedsForUpdate = async () => {
  const updatedMusicFeeds = await prisma.album.findMany({
    where: {
      isFeedPublished: false,
      isDraft: false,
      deleted: false,
      track: {
        some: {
          // Returns all records where one or more ("some") related records match filtering criteria.
          // In English: return all albums with at least one live, undeleted track
          deleted: false,
          isProcessing: false,
        },
      },
    },
    include: { track: true },
    orderBy: { updatedAt: "asc" },
  });

  return updatedMusicFeeds.map((musicFeed) => {
    const { id, title, updatedAt } = musicFeed;
    const feedUrl = `${FEED_URL}/${id}`;
    return { id, name: title, feedUrl, updatedAt, track: true };
  });
};

const publishFeeds = async () => {
  const updatedPodcasts = await wavlakePodcastsForUpdate();
  const updatedMusicFeeds = await wavlakeMusicFeedsForUpdate();

  const updatedFeeds = [...updatedPodcasts, ...updatedMusicFeeds];

  // log.info("last item");
  // log.info(updatedFeeds[updatedFeeds.length - 1]);

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

    log.info(`checking: ${name}`);
    const response = await podcastIndexApi
      .podcastsByFeedUrl(feedUrl)
      .catch((e) => {
        log.error(e);
        return { status: "false" };
      });

    // log.info(response);
    if (response.status === "true") {
      log.info("feed already exists, notifying hub");
      const { feed } = response;
      const { id } = feed;
      const { status } = await podcastIndexApi
        .hubPubNotifyById(id)
        .catch((e) => {
          log.error(e);
          return { status: "false" };
        });
      log.info(`Update status: ${status}`);
      if (status === "true") {
        await updateFeedStatus(feedItem);
      }
    } else {
      log.info("feed does not exist, adding");
      const addResponse = await podcastIndexApi
        .addByFeedUrl(feedUrl, chash)
        .catch((e) => {
          log.error(e);
          return { status: "false" };
        });
      log.info(addResponse);
      if (addResponse.status === "true") {
        await updateFeedStatus(feedItem);
      }
    }
  }
};

publishFeeds();

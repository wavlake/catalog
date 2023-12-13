require("dotenv").config();
const log = require("loglevel");
log.setLevel(process.env.LOGLEVEL);
import podcastIndex from "podcast-index-api";
import prisma from "@prismalocal/client";

const { PODCAST_INDEX_KEY, PODCAST_INDEX_SECRET } = process.env;
const podcastIndexApi = podcastIndex(PODCAST_INDEX_KEY, PODCAST_INDEX_SECRET);
const wavlakePodcastsForUpdate = async () => {
  log.debug("fetching new episodes");
  const newEpisodes = await prisma.episode.findMany({
    where: {
      createdAt: {
        // greater than now - 70 minutes
        gt: new Date(Date.now() - 420000000),
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
        },
      },
    },
  });

  log.debug(newEpisodes);
  return newEpisodes;
};

wavlakePodcastsForUpdate();

require("dotenv").config();
import log from "loglevel";
log.setLevel(process.env.LOGLEVEL);
import podcastIndex from "podcast-index-api";
import prisma from "../../prisma/client";

const { PODCAST_INDEX_KEY, PODCAST_INDEX_SECRET } = process.env;
const podcastIndexApi = podcastIndex(PODCAST_INDEX_KEY, PODCAST_INDEX_SECRET);

const wavlakePodcastsForUpdate = async () => {
  const newEpisodes = await prisma.episode.findMany({
    where: {
      createdAt: {
        // greater than now - 70 minutes
        gt: new Date(Date.now() - 4200000),
      },
      publishedAt: {
        // less than now
        lt: new Date(),
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

  return newEpisodes;
};

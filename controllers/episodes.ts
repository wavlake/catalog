import prisma from "../prisma/client";
import db from "../library/db";
import log from "loglevel";
import { randomUUID } from "crypto";
import { invalidateCdn } from "../library/cloudfrontClient";
import s3Client from "../library/s3Client";
import asyncHandler from "express-async-handler";
import { isEpisodeOwner, isPodcastOwner } from "../library/userHelper";
import { AWS_S3_EPISODE_PREFIX, AWS_S3_RAW_PREFIX } from "../library/constants";
import { addOP3URLPrefix } from "../library/op3";

const s3BucketName = `${process.env.AWS_S3_BUCKET_NAME}`;
const cdnDomain = `${process.env.AWS_CDN_DOMAIN}`;

interface Episode {
  liveUrl: string;
  podcastId: string;
  // other fields
}

export const get_episode = asyncHandler(async (req, res, next) => {
  const { episodeId } = req.params;

  const episode = await prisma.episode.findFirstOrThrow({
    where: { id: episodeId },
    include: {
      podcast: {
        select: {
          artworkUrl: true,
          id: true,
          name: true,
          podcastUrl: true,
          userId: true,
        },
      },
    },
  });

  // Add op3 url prefix to live url
  episode.liveUrl = addOP3URLPrefix({
    url: episode.liveUrl,
    podcastId: episode.podcast.id,
  });

  res.json({ success: true, data: episode });
});

export const get_episodes_by_account = asyncHandler(async (req, res, next) => {
  const userId = req["uid"];

  const episodes = await prisma.user.findMany({
    where: { id: userId },
    include: {
      podcast: {
        select: {
          artworkUrl: true,
          id: true,
          name: true,
          podcastUrl: true,
        },
      },
    },
  });
  res.json({ success: true, data: episodes });
});

export const get_episodes_by_podcast_id = asyncHandler(
  async (req, res, next) => {
    const { podcastId } = req.params;
    const { unpublished } = req.query;

    const episodes = await prisma.episodeInfo.findMany({
      where: {
        podcastId,
        ...(unpublished
          ? {}
          : {
              isProcessing: false,
              isDraft: false,
              publishedAt: { lte: new Date() },
            }),
      },
      orderBy: { order: "desc" },
    });

    // Add op3 url prefix to live url
    episodes.forEach((episode) => {
      episode.liveUrl = addOP3URLPrefix({
        url: episode.liveUrl,
        podcastId,
      });
    });
    res.json({ success: true, data: episodes });
  }
);

export const delete_episode = asyncHandler(async (req, res, next) => {
  const { episodeId } = req.params;
  const uid = req["uid"];

  if (!episodeId) {
    res.status(400).json({
      success: false,
      error: "episodeId field is required",
    });
    return;
  }

  // Check if user owns episode
  const isOwner = await isEpisodeOwner(uid, episodeId);

  if (!isOwner) {
    res.status(403).json({
      success: false,
      error: "User does not own this episode",
    });
    return;
  }

  log.debug(`Deleting episode ${episodeId}`);
  const deleteEpisodeData = await db
    .knex("episode")
    .where("id", "=", episodeId)
    .update({ deleted: true }, ["id", "episode", "podcast_id as podcastId"]);

  if (!deleteEpisodeData) {
    res.status(404).json({
      success: false,
      error: "Episode not found",
    });
    return;
  }

  const updatedAt = new Date();
  // Update podcast updatedAt
  await prisma.podcast.update({
    where: {
      id: deleteEpisodeData[0].podcastId,
    },
    data: {
      updatedAt,
    },
  });

  // Clean up S3 and CDN
  s3Client.deleteFromS3(`${AWS_S3_EPISODE_PREFIX}/${episodeId}.mp3`);
  invalidateCdn(`${AWS_S3_EPISODE_PREFIX}/${episodeId}.mp3`);

  res.send({ success: true, data: deleteEpisodeData[0] });
});

export const create_episode = asyncHandler(async (req, res, next) => {
  const request = {
    podcastId: req.body.podcastId,
    title: req.body.title,
    userId: req["uid"],
    order: req.body.order == "" ? 0 : parseInt(req.body.order),
    extension: req.body.extension,
    description: req.body.description,
    isExplicit: req.body.isExplicit ?? false,
  };

  if (
    !request.podcastId ||
    !request.title ||
    !request.order ||
    !request.extension
  ) {
    res.status(400).json({
      success: false,
      error: "podcastId, title, order, and extension fields is required",
    });
    return;
  }

  const isOwner = await isPodcastOwner(request.userId, request.podcastId);

  if (!isOwner) {
    res.status(403).json({
      success: false,
      error: "User does not own this podcast",
    });
    return;
  }

  // const albumDetails = await getAlbumDetails(request.albumId);

  const newepisodeId = randomUUID();

  const s3RawKey = `${AWS_S3_RAW_PREFIX}/${newepisodeId}`;
  const s3RawUrl = `https://${s3BucketName}.s3.us-east-2.amazonaws.com/${AWS_S3_RAW_PREFIX}/${newepisodeId}.${request.extension}`;
  const s3Key = `${AWS_S3_EPISODE_PREFIX}/${newepisodeId}.mp3`;

  const presignedUrl = await s3Client.generatePresignedUrl({
    key: s3RawKey,
    extension: request.extension,
  });

  const liveUrl = `${cdnDomain}/${s3Key}`;

  if (presignedUrl == null) {
    res.status(500).json({
      success: false,
      error: "Error generating presigned URL",
    });
    return;
  }

  return db
    .knex("episode")
    .insert(
      {
        id: newepisodeId,
        podcast_id: request.podcastId,
        live_url: liveUrl,
        title: request.title,
        order: request.order,
        description: request.description,
        raw_url: s3RawUrl,
        is_processing: true,
        // all newly created content starts a draft, user must publish after creation
        is_draft: true,
        is_explicit: req.body.isExplicit,
      },
      ["*"]
    )
    .then(async (data) => {
      log.debug(
        `Created new episode ${request.title} with id: ${data[0]["id"]}`
      );

      const updatedAt = new Date();
      // Update podcast updatedAt
      await prisma.podcast.update({
        where: {
          id: data[0].podcast_id,
        },
        data: {
          updatedAt,
        },
      });

      res.send({
        success: true,
        data: {
          id: data[0]["id"],
          podcastId: data[0]["podcast_id"],
          title: data[0]["title"],
          description: data[0]["description"],
          order: data[0]["order"],
          liveUrl: data[0]["liveUrl"],
          rawUrl: data[0]["raw_url"],
          presignedUrl: presignedUrl,
          isDraft: data[0]["is_draft"],
          isExplicit: data[0]["is_explicit"],
        },
      });
    })
    .catch((err) => {
      res.status(500).json({
        success: false,
        error: `Error creating new: ${err}`,
      });
    });
});

export const update_episode = asyncHandler(async (req, res, next) => {
  const { episodeId, title, order, description, isExplicit } = req.body;
  const uid = req["uid"];
  const updatedAt = new Date();

  if (!episodeId) {
    res.status(400).json({
      success: false,
      error: "episodeId field is required",
    });
    return;
  }

  const intOrder = parseInt(order);
  // only validate the order if it's present
  if (!!order && (!intOrder || isNaN(intOrder))) {
    res.status(400).json({
      success: false,
      error: "order field must be an integer",
    });
    return;
  }

  // Check if user owns episode
  const isOwner = await isEpisodeOwner(uid, episodeId);

  if (!isOwner) {
    res.status(403).json({
      success: false,
      error: "User does not own this episode",
    });
    return;
  }

  const unEditedEpisode = await prisma.episode.findFirst({
    where: { id: episodeId },
  });

  // if we are updating the title, check if the show already has an episode with that title
  if (title !== undefined) {
    const duplicateEpisodeTrack = await db
      .knex("episode")
      .where("podcast_id", "=", unEditedEpisode.podcastId)
      .andWhere("title", "=", title)
      .andWhere("deleted", "=", false)
      .first();

    if (duplicateEpisodeTrack && duplicateEpisodeTrack.id !== episodeId) {
      res.status(400).json({
        success: false,
        error:
          "Please pick another title, this show already has an episode with that title.",
      });
      return;
    }
  }

  log.debug(`Editing episode ${episodeId}`);
  const updatedEpisode = await prisma.episode.update({
    where: {
      id: episodeId,
    },
    data: {
      title,
      ...(order ? { order: intOrder } : {}),
      updatedAt,
      description,
      isExplicit,
    },
  });

  // Update podcast updatedAt
  await prisma.podcast.update({
    where: {
      id: updatedEpisode.podcastId,
    },
    data: {
      updatedAt,
    },
  });

  res.json({ success: true, data: updatedEpisode });
});

export const get_new_episodes = asyncHandler(async (req, res, next) => {
  // all episodes that are not deleted and have a publishedAt less than or equal to now (lte)
  try {
    const episodes = (await prisma.$queryRaw`
    SELECT 
      JSON_BUILD_OBJECT(
        'artworkUrl', p.artwork_url,
        'id', p.id,
        'name', p.name,
        'podcastUrl', p.podcast_url
      ) as podcast,
      e.id,
      e.title,
      e.description,
      e.duration,
      e.size,
      e.order,
      e.play_count as "playCount",
      e.compressor_error as "compressorError",
      e.created_at as "createdAt",
      e.deleted,
      e.is_draft as "isDraft",
      e.is_processing as "isProcessing",
      e.live_url as "liveUrl",
      e.msat_total as "msatTotal",
      e.podcast_id as "podcastId",
      e.published_at as "publishedAt",
      e.raw_url as "rawUrl",
      e.updated_at as "updatedAt",
      e.is_explicit as "isExplicit"
    FROM 
    (SELECT * FROM "podcast" 
       WHERE "is_draft" = false AND 
             "published_at" <= ${new Date()} 
       LIMIT 50) as p
      INNER JOIN "episode" as e ON p.id = e."podcast_id"
      INNER JOIN (
        SELECT
          "podcast_id",
          MAX("published_at") as maxDate
        FROM 
          "episode"
        WHERE
          "deleted" = false AND
          "published_at" <= ${new Date()} AND
          "is_draft" = false AND
          "is_processing" = false
        GROUP BY 
          "podcast_id"
      ) as latest ON e."podcast_id" = latest."podcast_id" AND e."published_at" = latest.maxDate
    WHERE
      p."is_draft" = false AND
      p."published_at" <= ${new Date()}
    ORDER BY
      e."published_at" DESC
  `) as Episode[];

    // Add op3 url prefix to live url
    episodes.forEach((episode) => {
      episode.liveUrl = addOP3URLPrefix({
        url: episode.liveUrl,
        podcastId: episode.podcastId,
      });
    });

    res.json({
      success: true,
      data: episodes,
    });
  } catch (err) {
    log.debug(`Error getting new episodes: ${err}`);
    next(err);
  }
});

// get the latest episode from each featured podcast
// to be a featured podcast, edit the is_featured field in the podcast table
export const get_featured_episodes = asyncHandler(async (req, res, next) => {
  try {
    const episodes = (await prisma.$queryRaw`
    SELECT 
      JSON_BUILD_OBJECT(
        'artworkUrl', p.artwork_url,
        'id', p.id,
        'name', p.name,
        'podcastUrl', p.podcast_url
      ) as podcast,
      e.id,
      e.title,
      e.description,
      e.duration,
      e.size,
      e.order,
      e.play_count as "playCount",
      e.compressor_error as "compressorError",
      e.created_at as "createdAt",
      e.deleted,
      e.is_draft as "isDraft",
      e.is_processing as "isProcessing",
      e.live_url as "liveUrl",
      e.msat_total as "msatTotal",
      e.podcast_id as "podcastId",
      e.published_at as "publishedAt",
      e.raw_url as "rawUrl",
      e.updated_at as "updatedAt",
      e.is_explicit as "isExplicit"
    FROM 
    (SELECT * FROM "podcast" 
       WHERE "is_draft" = false AND 
             "published_at" <= ${new Date()} AND 
             "is_featured" = true 
       LIMIT 10) as p
      INNER JOIN "episode" as e ON p.id = e."podcast_id"
      INNER JOIN (
        SELECT
          "podcast_id",
          MAX("published_at") as maxDate
        FROM 
          "episode"
        WHERE
          "deleted" = false AND
          "published_at" <= ${new Date()} AND
          "is_draft" = false AND
          "is_processing" = false
        GROUP BY 
          "podcast_id"
      ) as latest ON e."podcast_id" = latest."podcast_id" AND e."published_at" = latest.maxDate
    WHERE
      p."is_draft" = false AND
      p."published_at" <= ${new Date()} AND
      p."is_featured" = true
    ORDER BY
      e."published_at" DESC
  `) as Episode[];

    // Add op3 url prefix to live url
    episodes.forEach((episode) => {
      episode.liveUrl = addOP3URLPrefix({
        url: episode.liveUrl,
        podcastId: episode.podcastId,
      });
    });
    res.json({
      success: true,
      data: episodes,
    });
  } catch (err) {
    log.debug(`Error getting featured episodes: ${err}`);
    next(err);
  }
});

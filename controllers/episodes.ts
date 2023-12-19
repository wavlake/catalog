import prisma from "../prisma/client";
import db from "../library/db";
import log from "loglevel";
import { randomUUID } from "crypto";
import s3Client from "../library/s3Client";
import asyncHandler from "express-async-handler";
import { formatError } from "../library/errors";
import { isEpisodeOwner, isPodcastOwner } from "../library/userHelper";
import { AWS_S3_EPISODE_PREFIX, AWS_S3_RAW_PREFIX } from "../library/constants";

const s3BucketName = `${process.env.AWS_S3_BUCKET_NAME}`;
const cdnDomain = `${process.env.AWS_CDN_DOMAIN}`;

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
        },
      },
    },
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
      orderBy: { order: "asc" },
    });

    res.json({ success: true, data: episodes });
  }
);

export const delete_episode = asyncHandler(async (req, res, next) => {
  const { episodeId } = req.params;
  const uid = req["uid"];

  if (!episodeId) {
    const error = formatError(400, "episodeId field is required");
    next(error);
    return;
  }

  // Check if user owns episode
  const isOwner = await isEpisodeOwner(uid, episodeId);

  if (!isOwner) {
    const error = formatError(403, "User does not own this episode");
    next(error);
    return;
  }

  log.debug(`Deleting episode ${episodeId}`);
  db.knex("episode")
    .where("id", "=", episodeId)
    .update({ deleted: true }, ["id", "episode", "podcast_id as podcastId"])
    .then((data) => {
      res.send({ success: true, data: data[0] });
    })
    .catch((err) => {
      log.debug(`Error deleting episode ${episodeId}: ${err}`);
      next(err);
    });
});

export const create_episode = asyncHandler(async (req, res, next) => {
  const request = {
    podcastId: req.body.podcastId,
    title: req.body.title,
    userId: req["uid"],
    order: req.body.order == "" ? 0 : parseInt(req.body.order),
    extension: req.body.extension ?? "mp3",
    isDraft: req.body.isDraft ?? false,
  };

  if (!request.podcastId) {
    const error = formatError(400, "podcastId field is required");
    next(error);
    return;
  }

  const isOwner = await isPodcastOwner(request.userId, request.podcastId);

  if (!isOwner) {
    const error = formatError(403, "User does not own this album");
    next(error);
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
    const error = formatError(500, "Error generating presigned URL");
    next(error);
    return;
  }

  db.knex("episode")
    .insert(
      {
        id: newepisodeId,
        podcast_id: request.podcastId,
        live_url: liveUrl,
        title: request.title,
        order: request.order,
        raw_url: s3RawUrl,
        is_processing: true,
        is_draft: req.body.isDraft,
      },
      ["*"]
    )
    .then((data) => {
      log.debug(
        `Created new episode ${request.title} with id: ${data[0]["id"]}`
      );

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
        },
      });
    })
    .catch((err) => {
      const error = formatError(500, `Error creating new: ${err}`);
      next(error);
    });
});

export const update_episode = asyncHandler(async (req, res, next) => {
  const {
    episodeId,
    title,
    order,
    isDraft,
    publishedAt: publishedAtString,
    description,
  } = req.body;
  const uid = req["uid"];
  const publishedAt = publishedAtString
    ? new Date(publishedAtString)
    : undefined;
  const updatedAt = new Date();

  if (!episodeId) {
    const error = formatError(403, "episodeId field is required");
    next(error);
    return;
  }

  // Check if user owns episode
  const isOwner = await isEpisodeOwner(uid, episodeId);

  if (!isOwner) {
    const error = formatError(403, "User does not own this episode");
    next(error);
    return;
  }

  log.debug(`Editing episode ${episodeId}`);
  const updatedEpisode = await prisma.episode.update({
    where: {
      id: episodeId,
    },
    data: {
      title,
      ...(order ? { order: parseInt(order) } : {}),
      updatedAt,
      isDraft,
      publishedAt,
      description,
    },
  });
  res.json({ success: true, data: updatedEpisode });
});

export const get_new_episodes = asyncHandler(async (req, res, next) => {
  // all episodes that are not deleted and have a publishedAt less than or equal to now (lte)
  try {
    const episodes = await prisma.episode.findMany({
      where: {
        deleted: false,
        publishedAt: { lte: new Date() },
        isDraft: false,
        isProcessing: false,
        podcast: { isDraft: false, publishedAt: { lte: new Date() } },
      },
      orderBy: { publishedAt: "desc" },
      take: 10,
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
    // console.log(episodes);
    res.json({ success: true, data: episodes });
  } catch (err) {
    log.debug(`Error getting new episodes: ${err}`);
    next(err);
  }
});

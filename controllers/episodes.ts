import prisma from "../prisma/client";
import db from "../library/db";
import log from "loglevel";
import { randomUUID } from "crypto";
import s3Client from "../library/s3Client";
import asyncHandler from "express-async-handler";
import { formatError } from "../library/errors";
import { isEpisodeOwner, isPodcastOwner } from "../library/userHelper";
import { parseLimit } from "../library/helpers";

const randomSampleSize = process.env.RANDOM_SAMPLE_SIZE;

const s3BucketName = `${process.env.AWS_S3_BUCKET_NAME}`;
const cdnDomain = `${process.env.AWS_CDN_DOMAIN}`;
const episodePrefix = `${process.env.AWS_S3_EPISODE_PREFIX}`;
const rawPrefix = `${process.env.AWS_S3_RAW_PREFIX}`;

export const get_episode = asyncHandler(async (req, res, next) => {
  const { episodeId } = req.params;

  const episode = await prisma.episode.findFirstOrThrow({
    where: { id: episodeId },
  });

  res.json({ success: true, data: episode });
});

export const get_episodes_by_account = asyncHandler(async (req, res, next) => {
  const userId = req["uid"];

  const episodes = await prisma.user.findMany({
    where: { id: userId },
    include: {
      // podcast: {
      // },
    },
  });

  res.json({ success: true, data: episodes });
});

export const get_episodes_by_podcast_id = asyncHandler(
  async (req, res, next) => {
    const { podcastId } = req.params;

    const episodes = await prisma.episode.findMany({
      where: { podcastId },
      orderBy: { order: "asc" },
    });

    res.json({ success: true, data: episodes });
  }
);

export const get_episodes_by_new = asyncHandler(async (req, res, next) => {
  const limit = parseLimit(req.query.limit, 50);

  res.send({ success: true, data: [] });

  // TODO
  // const episodes = db.knex
  //   .select("episode.id as id", "episode.podcast_id as podcastId")
  //   .join("podcast", "podcast.id", "=", "episode.podcast_id")
  //   .rank("ranking", "track.id", "track.album_id")
  //   .min("track.title as title")
  //   .min("artist.name as artist")
  //   .min("artist.artist_url as artistUrl")
  //   .min("artist.artwork_url as avatarUrl")
  //   .min("album.artwork_url as artworkUrl")
  //   .min("album.title as albumTitle")
  //   .min("track.live_url as liveUrl")
  //   .min("track.duration as duration")
  //   .min("track.created_at as createdAt")
  //   .andWhere("track.deleted", "=", false)
  //   .andWhere("track.order", "=", 1)
  //   .from("track")
  //   .groupBy("track.album_id", "track.id")
  //   .as("a");

  // db.knex(albumTracks)
  //   .orderBy("createdAt", "desc")
  //   .where("ranking", "=", 1)
  //   .limit(limit)
  //   .then((data) => {
  //     // console.log(data);
  //     res.send({ success: true, data: data });
  //   })
  //   .catch((err) => {
  //     log.debug(`Error querying track table for New: ${err}`);
  //     next(err);
  //   });
});

export const delete_episode = asyncHandler(async (req, res, next) => {
  const { uid, episodeId } = req.params;

  if (!episodeId) {
    const error = formatError(400, "episodeId field is required");
    next(error);
  }

  // Check if user owns episode
  const isOwner = await isEpisodeOwner(uid, episodeId);

  if (!isOwner) {
    const error = formatError(403, "User does not own this episode");
    next(error);
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
  };

  if (!request.podcastId) {
    const error = formatError(400, "podcastId field is required");
    next(error);
  }

  const isOwner = await isPodcastOwner(request.userId, request.podcastId);

  if (!isOwner) {
    const error = formatError(403, "User does not own this album");
    next(error);
  }

  // const albumDetails = await getAlbumDetails(request.albumId);

  const newepisodeId = randomUUID();

  const s3RawKey = `${rawPrefix}/${newepisodeId}`;
  const s3RawUrl = `https://${s3BucketName}.s3.us-east-2.amazonaws.com/${rawPrefix}/${newepisodeId}.${request.extension}`;
  const s3Key = `${episodePrefix}/${newepisodeId}.mp3`;

  const presignedUrl = await s3Client.generatePresignedUrl({
    key: s3RawKey,
    extension: request.extension,
  });

  const liveUrl = `${cdnDomain}/${s3Key}`;

  if (presignedUrl == null) {
    const error = formatError(500, "Error generating presigned URL");
    next(error);
  }

  db.knex("episode")
    .insert(
      {
        id: newepisodeId,
        // artist_id: albumDetails.artistId,
        podcast_id: request.podcastId,
        live_url: liveUrl,
        title: request.title,
        order: request.order,
        raw_url: s3RawUrl,
        is_processing: true,
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
        },
      });
    })
    .catch((err) => {
      const error = formatError(500, `Error creating new: ${err}`);
      next(error);
    });
});

export const update_episode = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
    episodeId: req.body.episodeId,
    title: req.body.title,
    order: req.body.order,
    lyrics: req.body.lyrics,
  };

  if (!request.episodeId) {
    const error = formatError(403, "episodeId field is required");
    next(error);
  }

  // Check if user owns episode
  const isOwner = await isEpisodeOwner(request.userId, request.episodeId);

  if (!isOwner) {
    const error = formatError(403, "User does not own this episode");
    next(error);
  }

  log.debug(`Editing episode ${request.episodeId}`);
  db.knex("episode")
    .where("id", "=", request.episodeId)
    .update(
      {
        title: request.title,
        order: request.order,
        lyrics: request.lyrics,
        updated_at: db.knex.fn.now(),
      },
      ["*"]
    )
    .then((data) => {
      res.send({
        success: true,
        data: {
          id: data[0]["id"],
          podcastId: data[0]["podcast_id"],
          title: data[0]["title"],
          order: data[0]["order"],
          duration: data[0]["duration"],
          liveUrl: data[0]["liveUrl"],
          rawUrl: data[0]["raw_url"],
          size: data[0]["size"],
        },
      });
    })
    .catch((err) => {
      log.debug(`Error editing episode ${request.episodeId}: ${err}`);
      next(err);
    });
});

import log from "loglevel";
import db from "../library/db";
import { randomUUID } from "crypto";
import fs from "fs";
import multer from "multer";
import Jimp from "jimp";
import s3Client from "../library/s3Client";
import format from "../library/format";
import prisma from "../prisma/client";
import asyncHandler from "express-async-handler";
import { formatError } from "../library/errors";
import { isPodcastOwner } from "../library/userHelper";
import { invalidateCdn } from "../library/cloudfrontClient";
import { getStatus } from "../library/helpers";
import { AWS_S3_IMAGE_PREFIX } from "../library/constants";

const localConvertPath = `${process.env.LOCAL_CONVERT_PATH}`;
const cdnDomain = `${process.env.AWS_CDN_DOMAIN}`;

export const get_podcasts_by_account = asyncHandler(async (req, res, next) => {
  const { uid } = req.params;

  if (!uid) {
    res.status(400).send("userId is required");
  } else {
    const podcasts = await prisma.podcast.findMany({
      where: { userId: uid, deleted: false },
    });

    res.json({
      success: true,
      data: podcasts.map((podcast) => ({
        ...podcast,
        status: getStatus(podcast.isDraft, podcast.publishedAt),
      })),
    });
  }
});

export const get_podcast_by_id = asyncHandler(async (req, res, next) => {
  const { podcastId } = req.params;

  const podcast = await prisma.podcast.findFirstOrThrow({
    where: { id: podcastId },
  });

  res.json({ success: true, data: podcast });
});

export const get_podcast_by_url = asyncHandler(async (req, res, next) => {
  const { podcastUrl } = req.params;

  const podcast = await prisma.podcast.findFirstOrThrow({
    where: { podcastUrl },
  });

  res.json({ success: true, data: podcast });
});

export const create_podcast = asyncHandler(async (req, res, next) => {
  const newPodcastId = randomUUID();

  const request = {
    artwork: req.file,
    userId: req["uid"], //required, should come in with auth
    name: req.body.name, // required
    description: req.body.description ? req.body.description : "",
    twitter: req.body.twitter ? req.body.twitter : "",
    nostr: req.body.nostr ? req.body.nostr : "",
    instagram: req.body.instagram ? req.body.instagram : "",
    youtube: req.body.youtube ? req.body.youtube : "",
    website: req.body.website ? req.body.website : "",
    isDraft: req.body.isDraft ? req.body.isDraft : false,
  };

  if (!request.name) {
    const error = formatError(403, "Podcast name is required");
    next(error);
  }

  let uploadPath;
  let isKeeper = false;
  if (!request.artwork) {
    uploadPath = "./graphics/wavlake-icon-750.png";
    isKeeper = true;
  } else {
    uploadPath = request.artwork.path;
  }

  // console.log(request.image)
  // console.log(uploadPath)

  const convertPath = `${localConvertPath}/${newPodcastId}.jpg`;
  const s3Key = `${AWS_S3_IMAGE_PREFIX}/${newPodcastId}.jpg`;

  Jimp.read(uploadPath)
    .then((img) => {
      return img.resize(1875, Jimp.AUTO).quality(70).writeAsync(convertPath); // save
    })
    // Upload to S3
    .then((img) => {
      return (
        s3Client
          .uploadS3(convertPath, s3Key, "avatar")
          // Write metadata to db
          .then((data) => {
            log.debug(
              `Avatar for ${newPodcastId} uploaded to S3 ${data.Location}`
            );
            const liveUrl = `${cdnDomain}/${s3Key}`;
            db.knex("podcast")
              .insert(
                {
                  id: newPodcastId,
                  user_id: request.userId,
                  name: request.name,
                  description: request.description,
                  twitter: request.twitter,
                  instagram: request.instagram,
                  npub: request.nostr,
                  youtube: request.youtube,
                  website: request.website,
                  artwork_url: liveUrl,
                  podcast_url: format.urlFriendly(request.name),
                  is_draft: request.isDraft,
                  published_at: db.knex.fn.now(),
                },
                ["*"]
              )
              .then((data) => {
                log.debug(
                  `Created new podcast ${request.name} with id: ${data[0]["id"]}`
                );

                // Clean up with async calls to avoid blocking response
                log.debug(
                  `Deleting local files : ${convertPath} & ${uploadPath}`
                );
                fs.unlink(`${convertPath}`, (err) => {
                  if (err) log.debug(`Error deleting local file : ${err}`);
                });
                isKeeper
                  ? null
                  : fs.unlink(`${uploadPath}`, (err) => {
                      if (err) log.debug(`Error deleting local file : ${err}`);
                    });
                res.send({
                  success: true,
                  data: {
                    id: data[0]["id"],
                    userId: data[0]["user_id"],
                    name: data[0]["name"],
                    bio: data[0]["bio"],
                    twitter: data[0]["twitter"],
                    instagram: data[0]["instagram"],
                    npub: data[0]["npub"],
                    youtube: data[0]["youtube"],
                    website: data[0]["website"],
                    artworkUrl: data[0]["artwork_url"],
                    podcastUrl: data[0]["podcast_url"],
                    isDraft: data[0]["is_draft"],
                    publishedAt: data[0]["published_at"],
                  },
                });
              })
              .catch((err) => {
                if (err instanceof multer.MulterError) {
                  log.debug(`MulterError creating new podcast: ${err}`);

                  res.status(409).send("Something went wrong");
                } else if (err) {
                  log.debug(`Error creating new podcast: ${err}`);
                  if (err.message.includes("duplicate")) {
                    const error = formatError(
                      409,
                      "Podcast with that name already exists"
                    );
                    next(error);
                  } else {
                    const error = formatError(
                      500,
                      "Something went wrong creating podcast"
                    );
                    next(error);
                  }
                }
              });
          })
          .catch((err) => {
            log.debug(`Error creating new podcast: ${err}`);
            next(err);
          })
      );
    });
});

export const update_podcast = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
    podcastId: req.body.podcastId,
    name: req.body.name,
    description: req.body.description,
    twitter: req.body.twitter,
    nostr: req.body.nostr,
    instagram: req.body.instagram,
    youtube: req.body.youtube,
    website: req.body.website,
    isDraft: req.body.isDraft,
    publishedAt: req.body.publishedAt,
  };

  if (!request.podcastId) {
    const error = formatError(403, "podcastId field is required");
    next(error);
  }

  // Check if user owns podcast
  const isOwner = await isPodcastOwner(request.userId, request.podcastId);

  if (!isOwner) {
    const error = formatError(403, "User does not own this podcast");
    next(error);
  }

  log.debug(`Editing podcast ${request.podcastId}`);
  db.knex("podcast")
    .where("id", "=", request.podcastId)
    .update(
      {
        name: request.name,
        description: request.description,
        twitter: request.twitter,
        instagram: request.instagram,
        npub: request.nostr,
        youtube: request.youtube,
        website: request.website,
        podcast_url: format.urlFriendly(request.name),
        is_draft: request.isDraft,
        published_at: request.publishedAt,
      },
      ["*"]
    )
    .then((data) => {
      res.send({
        success: true,
        data: {
          id: data[0]["id"],
          userId: data[0]["user_id"],
          name: data[0]["name"],
          description: data[0]["description"],
          twitter: data[0]["twitter"],
          instagram: data[0]["instagram"],
          npub: data[0]["npub"],
          youtube: data[0]["youtube"],
          website: data[0]["website"],
          artworkUrl: data[0]["artwork_url"],
          podcastUrl: data[0]["podcast_url"],
          isDraft: data[0]["is_draft"],
          publishedAt: data[0]["published_at"],
        },
      });
    })
    .catch((err) => {
      console.log(err);
      log.debug(`Error editing podcast ${request.podcastId}: ${err}`);
      next(err);
    });
});

export const update_podcast_art = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
    artwork: req.file,
    podcastId: req.body.podcastId,
  };

  if (!request.podcastId) {
    const error = formatError(403, "podcastId field is required");
    next(error);
  }

  // Check if user owns podcast
  const isOwner = await isPodcastOwner(request.userId, request.podcastId);

  if (!isOwner) {
    const error = formatError(403, "User does not own this podcast");
    next(error);
  }

  const uploadPath = request.artwork.path;

  const convertPath = `${localConvertPath}/${request.podcastId}.jpg`;
  const s3Key = `${AWS_S3_IMAGE_PREFIX}/${request.podcastId}.jpg`;

  // Upload new image
  Jimp.read(uploadPath)
    .then((img) => {
      return img
        .resize(1875, Jimp.AUTO) // resize
        .quality(60) // set JPEG quality
        .writeAsync(convertPath); // save
    })
    // Upload to S3
    .then((img) => {
      s3Client.uploadS3(convertPath, s3Key, "artwork").then((data) => {
        log.trace(data);
        log.debug(
          `Artwork for podcast ${request.podcastId} uploaded to S3 ${data.Location}, refreshing cache...`
        );
        invalidateCdn(s3Key);
      });
    })
    .then(() => {
      const liveUrl = `${cdnDomain}/${s3Key}`;
      db.knex("podcast")
        .where("id", "=", request.podcastId)
        .update({ artwork_url: liveUrl, updated_at: db.knex.fn.now() }, ["id"])
        .then((data) => {
          res.send({ success: true, data: data[0] });
        });
    })
    .then(() => {
      log.debug(`Updated podcast artwork ${request.podcastId}`);

      // Clean up with async calls to avoid blocking response
      log.info(`Running clean up...`);
      log.debug(`Deleting local files : ${convertPath} & ${uploadPath}`);
      fs.unlink(`${convertPath}`, (err) => {
        if (err) log.debug(`Error deleting local file : ${err}`);
      });
      fs.unlink(`${uploadPath}`, (err) => {
        if (err) log.debug(`Error deleting local file : ${err}`);
      });
    })
    .catch((err) => {
      if (err instanceof multer.MulterError) {
        log.debug(`MulterError editing podcast artwork: ${err}`);
        next(err);
      } else if (err) {
        log.debug(`Error editing podcast artwork: ${err}`);
        next(err);
      }
    });
});

// TODO: Add clean up step for old artwork, see update_podcast_art
export const delete_podcast = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
    podcastId: req.params.podcastId,
  };

  if (!request.podcastId) {
    const error = formatError(403, "podcastId field is required");
    next(error);
  }

  // Check if user owns artist
  const isOwner = await isPodcastOwner(request.userId, request.podcastId);

  if (!isOwner) {
    const error = formatError(403, "User does not own this podcast");
    next(error);
  }

  log.debug(`Checking episodes for podcast ${request.podcastId}`);
  db.knex("episode")
    .select("episode.podcast_id as podcastId", "episode.deleted")
    .where("episode.podcast_id", "=", request.podcastId)
    .andWhere("episode.deleted", false)
    .then((data) => {
      if (data.length > 0) {
        const error = formatError(403, "Podcast has undeleted episodes");
        next(error);
      } else {
        log.debug(`Deleting podcast ${request.podcastId}`);
        db.knex("podcast")
          .where("id", "=", request.podcastId)
          .update({ deleted: true }, ["id", "name"])
          .then((data) => {
            res.send({ success: true, data: data[0] });
          })
          .catch((err) => {
            log.debug(`Error deleting podcast ${request.podcastId}: ${err}`);
            next(err);
          });
      }
    })
    .catch((err) => {
      log.debug(`Error deleting podcast ${request.podcastId}: ${err}`);
      next(err);
    });
});

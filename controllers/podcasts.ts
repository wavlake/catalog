const log = require("loglevel");
import db from "../library/db";
const { randomUUID } = require("crypto");
const fs = require("fs");
import multer from "multer";
const Jimp = require("jimp");
const s3Client = require("../library/s3Client");
const format = require("../library/format");
import prisma from "../prisma/client";
const asyncHandler = require("express-async-handler");
import { formatError } from "../library/errors";
const Sentry = require("@sentry/node");

const imagePrefix = `${process.env.AWS_S3_IMAGE_PREFIX}`;
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

    res.json({ success: true, data: podcasts });
  }
});

export const get_podcast_by_id = asyncHandler(async (req, res, next) => {
  const { podcastId } = req.params;

  const podcast = await prisma.podcast.findFirstOrThrow({
    where: { id: podcastId },
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
  const s3Key = `${imagePrefix}/${newPodcastId}.jpg`;

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
                  },
                });
              })
              .catch((err) => {
                Sentry.captureException(err);
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

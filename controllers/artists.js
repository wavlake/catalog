const log = require("loglevel");
import db from "../library/db";
const { randomUUID } = require("crypto");
const fs = require("fs");
import multer from "multer";
const Jimp = require("jimp");
const s3Client = require("../library/s3Client");
const format = require("../library/format");
const { isArtistOwner } = require("../library/userHelper");
import prisma from "../prisma/client";
const asyncHandler = require("express-async-handler");
import { formatError } from "../library/errors";
const { invalidateCdn } = require("../library/cloudfrontClient");
const Sentry = require("@sentry/node");

const imagePrefix = `${process.env.AWS_S3_IMAGE_PREFIX}`;
const localConvertPath = `${process.env.LOCAL_CONVERT_PATH}`;
const cdnDomain = `${process.env.AWS_CDN_DOMAIN}`;

const get_artist_by_url = asyncHandler(async (req, res, next) => {
  const request = {
    artistUrl: req.params.artistUrl,
  };

  const artist = await prisma.artist.findFirstOrThrow({
    where: { artistUrl: request.artistUrl },
  });

  res.json({ success: true, data: artist });
});

const get_artist_by_id = asyncHandler(async (req, res, next) => {
  const request = {
    artistId: req.params.artistId,
  };

  const artist = await prisma.artist.findFirstOrThrow({
    where: { id: request.artistId },
  });

  res.json({ success: true, data: artist });
});

const get_artists_by_account = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req.params.uid,
  };

  const artists = await prisma.artist.findMany({
    where: { userId: request.userId, deleted: false },
  });

  res.json({ success: true, data: artists });
});

const create_artist = asyncHandler(async (req, res, next) => {
  const newArtistId = randomUUID();

  const request = {
    artwork: req.file,
    userId: req["uid"], //required, should come in with auth
    name: req.body.name, // required
    bio: req.body.bio ? req.body.bio : "",
    twitter: req.body.twitter ? req.body.twitter : "",
    nostr: req.body.nostr ? req.body.nostr : "",
    instagram: req.body.instagram ? req.body.instagram : "",
    youtube: req.body.youtube ? req.body.youtube : "",
    website: req.body.website ? req.body.website : "",
  };

  if (!request.name) {
    const error = formatError(403, "Artist name is required");
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

  const convertPath = `${localConvertPath}/${newArtistId}.jpg`;
  const s3Key = `${imagePrefix}/${newArtistId}.jpg`;

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
              `Avatar for ${newArtistId} uploaded to S3 ${data.Location}`
            );
            const liveUrl = `${cdnDomain}/${s3Key}`;
            db.knex("artist")
              .insert(
                {
                  id: newArtistId,
                  user_id: request.userId,
                  name: request.name,
                  bio: request.bio,
                  twitter: request.twitter,
                  instagram: request.instagram,
                  npub: request.nostr,
                  youtube: request.youtube,
                  website: request.website,
                  artwork_url: liveUrl,
                  artist_url: format.urlFriendly(request.name),
                },
                ["*"]
              )
              .then((data) => {
                log.debug(
                  `Created new artist ${request.name} with id: ${data[0]["id"]}`
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
                    artistUrl: data[0]["artist_url"],
                  },
                });
              })
              .catch((err) => {
                Sentry.captureException(err);
                if (err instanceof multer.MulterError) {
                  log.debug(`MulterError creating new artist: ${err}`);

                  res.status(409).send("Something went wrong");
                } else if (err) {
                  log.debug(`Error creating new artist: ${err}`);
                  if (err.message.includes("duplicate")) {
                    const error = formatError(
                      409,
                      "Artist with that name already exists"
                    );
                    next(error);
                  } else {
                    const error = formatError(
                      500,
                      "Something went wrong creating artist"
                    );
                    next(error);
                  }
                }
              });
          })
          .catch((err) => {
            log.debug(`Error creating new artist: ${err}`);
            next(err);
          })
      );
    });
});

const update_artist = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
    artistId: req.body.artistId,
    name: req.body.name,
    bio: req.body.bio ? req.body.bio : "",
    twitter: req.body.twitter ? req.body.twitter : "",
    nostr: req.body.nostr ? req.body.nostr : "",
    instagram: req.body.instagram ? req.body.instagram : "",
    youtube: req.body.youtube ? req.body.youtube : "",
    website: req.body.website ? req.body.website : "",
  };

  if (!request.artistId) {
    const error = formatError(403, "artistId field is required");
    next(error);
  }

  // Check if user owns artist
  const isArtistOwner = await isArtistOwner(request.userId, request.artistId);

  if (!isArtistOwner) {
    const error = formatError(403, "User does not own this artist");
    next(error);
  }

  log.debug(`Editing artist ${request.artistId}`);
  db.knex("artist")
    .where("id", "=", request.artistId)
    .update(
      {
        name: request.name,
        bio: request.bio,
        twitter: request.twitter,
        instagram: request.instagram,
        npub: request.nostr,
        youtube: request.youtube,
        website: request.website,
        artist_url: format.urlFriendly(request.name),
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
          bio: data[0]["bio"],
          twitter: data[0]["twitter"],
          instagram: data[0]["instagram"],
          npub: data[0]["npub"],
          youtube: data[0]["youtube"],
          website: data[0]["website"],
          artworkUrl: data[0]["artwork_url"],
          artistUrl: data[0]["artist_url"],
        },
      });
    })
    .catch((err) => {
      log.debug(`Error editing artist ${request.artistId}: ${err}`);
      next(err);
    });
});

const update_artist_art = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
    artwork: req.file,
    artistId: req.body.artistId,
  };

  if (!request.artistId) {
    const error = formatError(403, "artistId field is required");
    next(error);
  }

  // Check if user owns artist
  const isArtistOwner = await isArtistOwner(request.userId, request.artistId);

  if (!isArtistOwner) {
    const error = formatError(403, "User does not own this artist");
    next(error);
  }

  const uploadPath = request.artwork.path;

  const convertPath = `${localConvertPath}/${request.artistId}.jpg`;
  const s3Key = `${imagePrefix}/${request.artistId}.jpg`;

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
          `Artwork for artist ${request.artistId} uploaded to S3 ${data.Location}, refreshing cache...`
        );
        invalidateCdn(s3Key);
      });
    })
    .then(() => {
      const liveUrl = `${cdnDomain}/${s3Key}`;
      db.knex("artist")
        .where("id", "=", request.artistId)
        .update({ artwork_url: liveUrl, updated_at: db.knex.fn.now() }, ["id"])
        .then((data) => {
          res.send({ success: true, data: data[0] });
        });
    })
    .then(() => {
      log.debug(`Updated artist artwork ${request.artistId}`);

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
        log.debug(`MulterError editing artist artwork: ${err}`);
        next(err);
      } else if (err) {
        log.debug(`Error editing artist artwork: ${err}`);
        next(err);
      }
    });
});

// TODO: Add clean up step for old artwork, see update_artist_art
const delete_artist = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
    artistId: req.params.artistId,
  };

  if (!request.artistId) {
    const error = formatError(403, "artistId field is required");
    next(error);
  }

  // Check if user owns artist
  const isArtistOwner = await isArtistOwner(request.userId, request.artistId);

  if (!isArtistOwner) {
    const error = formatError(403, "User does not own this artist");
    next(error);
  }

  log.debug(`Checking albums for artist ${request.artistId}`);
  db.knex("album")
    .select("album.artist_id as artistId", "album.deleted")
    .where("album.artist_id", "=", request.artistId)
    .andWhere("album.deleted", false)
    .then((data) => {
      if (data.length > 0) {
        const error = formatError(403, "Artist has undeleted albums");
        next(error);
      } else {
        log.debug(`Deleting artist ${request.artistId}`);
        db.knex("artist")
          .where("id", "=", request.artistId)
          .update({ deleted: true }, ["id", "name"])
          .then((data) => {
            res.send({ success: true, data: data[0] });
          })
          .catch((err) => {
            log.debug(`Error deleting artist ${request.artistId}: ${err}`);
            next(err);
          });
      }
    })
    .catch((err) => {
      log.debug(`Error deleting artist ${request.artistId}: ${err}`);
      next(err);
    });
});
//////////// HELPERS ///////////////

async function getArtworkPath(artistId) {
  const regexp =
    /^(([^:\/?#]+):)?(\/\/([^\/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/;

  return new Promise((resolve, reject) => {
    return db
      .knex("artist")
      .select("artwork_url")
      .where("id", "=", artistId)
      .then((data) => {
        const match = data[0].artwork_url.match(regexp);
        resolve(match[5]);
      })
      .catch((e) => log.error(`Error looking up artist artwork_url: ${e}`));
  });
}

export default {
  get_artists_by_account,
  get_artist_by_url,
  get_artist_by_id,
  create_artist,
  update_artist,
  update_artist_art,
  delete_artist,
};

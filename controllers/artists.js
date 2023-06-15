const log = require("loglevel");
import db from "../library/db";
const { randomUUID } = require("crypto");
const fs = require("fs");
import multer from "multer";
const Jimp = require("jimp");
const s3Client = require("../library/s3Client");
const format = require("../library/format");
const { getArtistAccount } = require("../library/userHelper");
import prisma from "../prisma/client";

const imagePrefix = `${process.env.AWS_S3_IMAGE_PREFIX}`;
const localConvertPath = `${process.env.LOCAL_CONVERT_PATH}`;
const cdnDomain = `${process.env.AWS_CDN_DOMAIN}`;

// Error handling
// Ref: https://stackoverflow.com/questions/43356705/node-js-express-error-handling-middleware-with-router
const handleErrorAsync = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    next(error);
  }
};

const get_artist_by_url = handleErrorAsync(async (req, res, next) => {
  const request = {
    artistUrl: req.params.artistUrl,
  };

  const artist = await prisma.artist.findFirstOrThrow({
    where: { artist_url: request.artistUrl },
  });

  res.json(artist);
});

const get_artist_by_id = handleErrorAsync(async (req, res, next) => {
  const request = {
    artistId: req.params.artistId,
  };

  const artist = await prisma.artist.findFirstOrThrow({
    where: { id: request.artistId },
  });

  res.json(artist);
});

const create_artist = handleErrorAsync(async (req, res, next) => {
  const newArtistId = randomUUID();

  // TODO: Add other attributes like twitter handle, etc.
  const request = {
    artwork: req.file,
    userId: req.uid, //required, should come in with auth
    name: req.body.name, // required
    bio: req.body.bio,
  };

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
                artwork_url: liveUrl,
                artist_url: format.urlFriendly(request.name),
              },
              ["id"]
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
              res.send(data);
            })
            .catch((err) => {
              if (err instanceof multer.MulterError) {
                log.debug(`MulterError creating new artist: ${err}`);
                res.status(409).send("Something went wrong");
              } else if (err) {
                log.debug(`Error creating new artist: ${err}`);
                if (err.message.includes("duplicate")) {
                  res.status(409).send("Artist already exists");
                } else {
                  res.status(409).send("Something went wrong");
                }
              }
            });
        })
        .catch((err) => {
          log.debug(`Error encoding new artist: ${err}`);
          next(err);
        });
    });
});

const update_artist = handleErrorAsync(async (req, res, next) => {
  const request = {
    artistId: req.body.artistId,
    name: req.body.name,
    bio: req.body.bio,
    twitter: req.body.twitter,
    nostr: req.body.nostr,
    instagram: req.body.instagram,
    youtube: req.body.youtube,
    website: req.body.website,
  };

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
      ["id", "name"]
    )
    .then((data) => {
      res.send(data);
    })
    .catch((err) => {
      log.debug(`Error editing artist ${request.artistId}: ${err}`);
      next(err);
    });
});

const update_artist_art = handleErrorAsync(async (req, res, next) => {
  const newImageId = randomUUID();

  const request = {
    artwork: req.file,
    artistId: req.body.artistId,
  };

  const uploadPath = request.artwork.path;

  const convertPath = `${localConvertPath}/${request.artistId}.jpg`;
  const s3Key = `${imagePrefix}/${newImageId}.jpg`;

  // Get old url
  let oldUrl;
  getArtworkPath(request.artistId)
    .then((old) => {
      oldUrl = old;
    })
    .catch((err) =>
      log.debug(
        `Error retrieiving current artwork_url for ${request.userId}: ${err}`
      )
    )
    .then(() => {
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
          s3Client.uploadS3(convertPath, s3Key, "avatar").then((data) => {
            log.trace(data);
            log.debug(
              `Artwork for artist ${request.artistId} uploaded to S3 ${data.Location}`
            );
            // res.send(data);
          });
        })
        .then(() => {
          const liveUrl = `${cdnDomain}/${s3Key}`;
          db.knex("artist")
            .where("id", "=", request.artistId)
            .update({ artwork_url: liveUrl, updated_at: db.knex.fn.now() }, [
              "id",
            ])
            .then((data) => {
              res.send(data);
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

          // Clean up S3
          s3Client
            .deleteFromS3(oldUrl)
            .catch((err) => log.debug(`Error deleting from S3: ${err}`));
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
});

// TODO: Add clean up step for old artwork, see update_artist_art
const delete_artist = handleErrorAsync(async (req, res, next) => {
  const request = {
    userId: req.uid,
    artistId: req.params.artistId,
  };

  log.debug(
    `DELETE ARTIST request: getting owner for artist ${request.artistId}`
  );
  getArtistAccount(request.artistId)
    .then((data) => {
      log.debug(`Artist ${request.artistId} owner: ${data.userId}`);
      if (request.userId === data.userId) {
        log.debug(`Checking albums for artist ${request.artistId}`);
        db.knex("album")
          .select("album.artist_id as artistId", "album.deleted")
          .where("album.artist_id", "=", request.artistId)
          .andWhere("album.deleted", false)
          .then((data) => {
            if (data.length > 0) {
              log.debug(
                `Canceling delete request, artist ${request.artistId} has undeleted albums`
              );
              res.status(406).send("Artist must have no albums");
            } else {
              log.debug(`Deleting artist ${request.artistId}`);
              db.knex("artist")
                .where("id", "=", request.artistId)
                .update({ deleted: true }, ["id", "name"])
                .then((data) => {
                  res.send(data);
                })
                .catch((err) => {
                  log.debug(
                    `Error deleting artist ${request.artistId}: ${err}`
                  );
                  next(err);
                });
            }
          })
          .catch((err) => {
            log.debug(`Error deleting artist ${request.artistId}: ${err}`);
            next(err);
          });
      } else {
        return res.status(403).send("Wrong owner");
      }
    })
    .catch((err) => {
      log.debug(`Error deleting album ${request.albumId}: ${err}`);
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
  get_artist_by_url,
  get_artist_by_id,
  create_artist,
  update_artist,
  update_artist_art,
  delete_artist,
};

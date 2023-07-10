const log = require("loglevel");
import db from "../library/db";
const { randomUUID } = require("crypto");
const fs = require("fs");
const multer = require("multer");
const Jimp = require("jimp");
const s3Client = require("../library/s3Client");
import prisma from "../prisma/client";
const { getAlbumAccount } = require("../library/userHelper");

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

const get_albums_by_account = handleErrorAsync(async (req, res, next) => {
  const request = {
    userId: req.uid,
  };

  db.knex("user")
    .join("artist", "user.id", "=", "artist.user_id")
    .join("album", "artist.id", "=", "album.artist_id")
    .select(
      "album.id as id",
      "album.title as title",
      "album.artwork_url as artworkUrl",
      "artist.name as name"
    )
    .where("user.id", "=", request.userId)
    .andWhere("album.deleted", "=", false)
    .then((data) => {
      // console.log(data)
      res.send(data);
    })
    .catch((err) => {
      next(err);
    });
});

const get_album_by_id = handleErrorAsync(async (req, res, next) => {
  const request = {
    albumId: req.params.albumId,
  };

  const album = await prisma.album.findFirstOrThrow({
    where: { id: request.albumId },
  });

  res.json(album);
});

const get_albums_by_artist_id = handleErrorAsync(async (req, res, next) => {
  const request = {
    artistId: req.params.artistId,
    // limit: req.query.limit ? req.query.limit : 10,
    // sortBy: req.body.sortBy
  };

  const albums = await prisma.album.findMany({
    where: { artistId: request.artistId, deleted: false },
  });

  res.json(albums);
});

const create_album = handleErrorAsync(async (req, res, next) => {
  const newAlbumId = randomUUID();

  const request = {
    artwork: req.file,
    artistId: req.body.artistId,
    title: req.body.title,
    description: req.body.description,
  };

  let uploadPath;
  let isKeeper = false;
  if (!request.artwork) {
    uploadPath = "./graphics/wavlake-icon-750.png";
    isKeeper = true;
  } else {
    uploadPath = request.artwork.path;
  }

  const convertPath = `${localConvertPath}/${newAlbumId}.jpg`;
  const s3Key = `${imagePrefix}/${newAlbumId}.jpg`;

  Jimp.read(uploadPath)
    .then((img) => {
      return img
        .resize(500, 500) // resize
        .quality(60) // set JPEG quality
        .writeAsync(convertPath); // save
    })
    // Upload to S3
    .then((img) => {
      s3Client
        .uploadS3(convertPath, s3Key, "artwork")
        // Write metadata to db
        .then((data) => {
          log.debug(
            `Artwork for ${newAlbumId} uploaded to S3 ${data.Location}`
          );
          const liveUrl = `${cdnDomain}/${s3Key}`;
          db.knex("album")
            .insert(
              {
                id: newAlbumId,
                artist_id: request.artistId,
                title: request.title,
                description: request.description,
                artwork_url: liveUrl,
              },
              ["*"]
            )
            .then((data) => {
              log.debug(
                `Created new album ${request.title} with id: ${data[0]["id"]}`
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
                id: data[0]["id"],
                title: data[0]["title"],
                artworkUrl: data[0]["artwork_url"],
                artistId: data[0]["artist_id"],
                description: data[0]["description"],
              });
            })
            .catch((err) => {
              if (err instanceof multer.MulterError) {
                log.debug(`MulterError creating new album: ${err}`);
                next(err);
              } else if (err) {
                log.debug(`Error creating new album: ${err}`);
                next(err);
              }
            });
        })
        .catch((err) => {
          log.debug(`Error encoding new album: ${err}`);
          next(err);
        });
    });
});

const update_album = handleErrorAsync(async (req, res, next) => {
  const request = {
    albumId: req.body.albumId,
    title: req.body.title,
    description: req.body.description,
  };

  if (!request.albumId) {
    res.status(400).send("albumId is required");
  }

  log.debug(`Editing album ${request.albumId}`);
  db.knex("album")
    .where("id", "=", request.albumId)
    .update(
      {
        title: request.title,
        description: request.description,
        updated_at: db.knex.fn.now(),
      },
      ["*"]
    )
    .then((data) => {
      res.send({
        id: data[0]["id"],
        title: data[0]["title"],
        artworkUrl: data[0]["artwork_url"],
        artistId: data[0]["artist_id"],
        description: data[0]["description"],
      });
    })
    .catch((err) => {
      log.debug(`Error editing album ${request.albumId}: ${err}`);
      next(err);
    });
});

const update_album_art = handleErrorAsync(async (req, res, next) => {
  const newImageId = randomUUID();

  const request = {
    artwork: req.file,
    albumId: req.body.albumId,
  };

  if (!request.albumId) {
    res.status(400).send("albumId is required");
  }

  const uploadPath = request.artwork.path;
  let oldUrl;

  const convertPath = `${localConvertPath}/${request.albumId}.jpg`;
  const s3Key = `${imagePrefix}/${newImageId}.jpg`;

  log.debug(`Editing album artwork ${request.albumId}`);
  // Get old url
  getArtworkPath(request.albumId)
    .then((old) => {
      oldUrl = old;
    })
    .catch((err) =>
      log.debug(
        `Error retrieiving current artwork_url for ${request.albumId}: ${err}`
      )
    )
    .then(() => {
      // Upload new image
      Jimp.read(uploadPath)
        .then((img) => {
          return img
            .resize(500, 500) // resize
            .quality(60) // set JPEG quality
            .writeAsync(convertPath); // save
        })
        // Upload to S3
        .then((img) => {
          s3Client.uploadS3(convertPath, s3Key, "artwork").then((data) => {
            log.trace(data);
            log.debug(
              `Artwork for ${request.albumId} uploaded to S3 ${data.Location}`
            );
          });
        })
        .then(() => {
          const liveUrl = `${cdnDomain}/${s3Key}`;
          db.knex("album")
            .where("id", "=", request.albumId)
            .update({ artwork_url: liveUrl, updated_at: db.knex.fn.now() }, [
              "id",
            ])
            .then((data) => {
              res.send(data);
            });
        })
        .then(() => {
          log.debug(`Updated album artwork ${request.albumId}`);

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
            log.debug(`MulterError creating new album: ${err}`);
            next(err);
          } else if (err) {
            log.debug(`Error creating new album: ${err}`);
            next(err);
          }
        });
    });
});

const delete_album = handleErrorAsync(async (req, res, next) => {
  const request = {
    userId: req.uid,
    albumId: req.params.albumId,
  };

  if (!request.albumId) {
    res.status(400).send("albumId is required");
  }

  log.debug(`DELETE ALBUM request: getting owner for track ${request.albumId}`);
  getAlbumAccount(request.albumId)
    .then((data) => {
      log.debug(`Album ${request.albumId} owner: ${data.userId}`);
      if (request.userId === data.userId) {
        log.debug(`Checking tracks for album ${request.albumId}`);
        db.knex("track")
          .select("track.album_id as albumId", "track.deleted")
          .where("track.album_id", "=", request.albumId)
          .andWhere("track.deleted", false)
          .then((data) => {
            if (data.length > 0) {
              res.status(406).send("Album must be empty");
            } else {
              log.debug(`Deleting album ${request.albumId}`);
              db.knex("album")
                .where("id", "=", request.albumId)
                .update({ deleted: true }, ["id", "title"])
                .then((data) => {
                  res.send(data[0]);
                })
                .catch((err) => {
                  log.debug(`Error deleting album ${request.albumId}: ${err}`);
                  next(err);
                });
            }
          })
          .catch((err) => {
            log.debug(`Error deleting album ${request.albumId}: ${err}`);
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

////////// HELPERS //////////

async function getArtworkPath(albumId) {
  const regexp =
    /^(([^:\/?#]+):)?(\/\/([^\/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/;

  return new Promise((resolve, reject) => {
    return db
      .knex("album")
      .select("artwork_url")
      .where("id", "=", albumId)
      .then((data) => {
        const match = data[0].artwork_url.match(regexp);
        // console.log(match[5])
        resolve(match[5]);
      })
      .catch((e) => log.error(`Error looking up album artwork_url: ${e}`));
  });
}

export default {
  get_albums_by_account,
  get_album_by_id,
  delete_album,
  create_album,
  update_album,
  update_album_art,
  get_albums_by_artist_id,
};

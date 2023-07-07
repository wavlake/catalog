import prisma from "../prisma/client";
import db from "../library/db";
const log = require("loglevel");
const mp3Duration = require("mp3-duration");
const { randomUUID } = require("crypto");
const Lame = require("node-lame").Lame;
const fs = require("fs");
const { s3 } = require("../library/s3Client");
const multer = require("multer");
const { getAlbumAccount, getTrackAccount } = require("../library/userHelper");

const s3BucketName = `${process.env.AWS_S3_BUCKET_NAME}`;
const cdnDomain = `${process.env.AWS_CDN_DOMAIN}`;
const trackPrefix = `${process.env.AWS_S3_TRACK_PREFIX}`;
const rawPrefix = `${process.env.AWS_S3_RAW_PREFIX}`;
const localConvertPath = `${process.env.LOCAL_CONVERT_PATH}`;
const localUploadPath = `${process.env.LOCAL_UPLOAD_PATH}`;

// Error handling
// Ref: https://stackoverflow.com/questions/43356705/node-js-express-error-handling-middleware-with-router
const handleErrorAsync = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    next(error);
  }
};

// Top 40
const get_index_top = handleErrorAsync(async (req, res, next) => {
  const request = {
    limit: req.query.limit ? req.query.limit : 41,
  };

  const tracks = await prisma.trackInfo.findMany({
    where: { msat_total_30_days: { gt: 0 } },
    orderBy: { msat_total_30_days: "desc" },
    take: request.limit,
  });

  res.json(tracks);
});

const get_track = handleErrorAsync(async (req, res, next) => {
  const request = {
    trackId: req.params.trackId,
  };

  const track = await prisma.trackInfo.findFirstOrThrow({
    where: { id: request.trackId },
  });

  res.json(track);
});

const delete_track = handleErrorAsync(async (req, res, next) => {
  const request = {
    userId: req.uid,
    trackId: req.params.trackId,
  };

  if (!request.trackId) {
    return res.status(400).send("trackId is required");
  }

  log.debug(`DELETE TRACK request: getting owner for track ${request.trackId}`);
  getTrackAccount(request.trackId)
    .then((data) => {
      log.debug(`Track ${request.trackId} owner: ${data.userId}`);
      if (request.userId === data.userId) {
        log.debug(`Deleting track ${request.trackId}`);
        db.knex("track")
          .where("id", "=", request.trackId)
          .update({ deleted: true }, ["id", "title"])
          .then((data) => {
            res.send(data);
          })
          .catch((err) => {
            log.debug(`Error deleting track ${request.trackId}: ${err}`);
            next(err);
          });
      } else {
        return res.status(403).send("Wrong owner");
      }
    })
    .catch((err) => {
      log.debug(`Error deleting track ${request.trackId}: ${err}`);
      next(err);
    });
});

// TODO: Refactor this completely. Temp fix is to bump up the timeout on NGINX so
// that these long uploads don't end on 504 errors. New approach should be to:
// 1) client uploads directly to S3
// 2) server compresses file and uploads to S3
// 3) server enters record into DB
// Steps 2 and 3 can happen async in the background while client moves on
const create_track = handleErrorAsync(async (req, res, next) => {
  const request = {
    audio: req.file,
    albumId: req.body.albumId,
    title: req.body.title,
    userId: req.uid,
    order: req.body.order,
  };

  if (!request.albumId) {
    return res.status(400).send("albumId is required");
  }

  const albumAccount = await getAlbumAccount(request.albumId);

  if (!albumAccount == request.userId) {
    return res.status(403).send("Wrong owner");
  }

  const albumDetails = await getAlbumDetails(request.albumId);

  const newTrackId = randomUUID();

  const localUploadFilename = request.audio.filename;

  // Encode audio file to standard MP3
  const encoder = new Lame({
    output: `${localConvertPath}/${newTrackId}.mp3`,
    bitrate: 128,
    mode: "j",
    meta: {
      title: request.title,
      // artist: request.artistName, TODO: Add artist name to track metadata
      album: albumDetails.albumTitle,
      comment: "Wavlake",
    },
  }).setFile(`${localUploadPath}/${localUploadFilename}`);

  let duration;
  const s3Key = `${trackPrefix}/${newTrackId}.mp3`;

  encoder.encode().then(() => {
    mp3Duration(`${localUploadPath}/${localUploadFilename}`)
      .then((d) => {
        // Upload to S3
        duration = parseInt(d);
        const object = {
          Bucket: s3BucketName,
          Key: s3Key,
          Body: fs.readFileSync(`${localConvertPath}/${newTrackId}.mp3`),
          ContentType: "audio/mpeg",
        };
        s3.upload(object, (err, data) => {
          if (err) {
            log.debug(`Error uploading ${newTrackId} to S3: ${err}`);
          }
        })
          .promise()
          // Write metadata to db
          .then((data) => {
            log.debug(`Track ${newTrackId} uploaded to S3 ${data.Location}`);
            const liveUrl = `${cdnDomain}/${s3Key}`;
            fs.promises
              .stat(`${localConvertPath}/${newTrackId}.mp3`)
              .then((fileStats) => {
                db.knex("track")
                  .insert(
                    {
                      id: newTrackId,
                      artist_id: albumDetails.artistId,
                      album_id: request.albumId,
                      live_url: liveUrl,
                      title: request.title,
                      order: request.order,
                      duration: duration,
                      size: fileStats.size,
                    },
                    [
                      "id",
                      "artist_id",
                      "album_id",
                      "live_url",
                      "title",
                      "order",
                      "duration",
                      "size",
                    ]
                  )
                  .then((data) => {
                    log.debug(
                      `Created new track ${request.title} with id: ${data[0]["id"]}`
                    );

                    const extension = localUploadFilename.split(".").pop();
                    // Upload original file to S3 with another async call
                    const original = {
                      Bucket: s3BucketName,
                      Key: `${rawPrefix}/${newTrackId}.${extension}`,
                      Body: fs.readFileSync(
                        `${localUploadPath}/${localUploadFilename}`
                      ),
                    };
                    s3.upload(original, (err, data) => {
                      if (err) {
                        log.debug(
                          `Error uploading raw version of ${newTrackId} to S3: ${err}`
                        );
                      }
                    })
                      .promise()
                      .then((data) => {
                        log.debug(
                          `Uploaded raw version of ${newTrackId} uploaded to S3 ${data.Location}`
                        );
                        db.knex("track")
                          .where({ id: newTrackId })
                          .update({ raw_url: data.Location })
                          .then((data) => {
                            log.debug(
                              `Added raw_url for ${newTrackId} to track table`
                            );
                          })
                          .catch((err) => {
                            log.debug(
                              `Error adding raw_url for ${newTrackId} to track table: ${err}`
                            );
                          });
                        // Clean up with async calls to avoid blocking response
                        log.debug(
                          `Deleting local files : ${localConvertPath}/${newTrackId}.mp3 & ${localUploadPath}/${localUploadFilename}`
                        );
                        fs.unlink(
                          `${localConvertPath}/${newTrackId}.mp3`,
                          (err) => {
                            if (err)
                              log.debug(`Error deleting local file : ${err}`);
                          }
                        );
                        fs.unlink(
                          `${localUploadPath}/${localUploadFilename}`,
                          (err) => {
                            if (err)
                              log.debug(`Error deleting local file : ${err}`);
                          }
                        );
                      });

                    res.send(data);
                  });
              });
          })
          .catch((err) => {
            if (err instanceof multer.MulterError) {
              log.debug(`MulterError creating new track: ${err}`);
              next(err);
            } else if (err) {
              log.debug(`Error creating new track: ${err}`);
              next(err);
            }
          });
      })
      .catch((err) => {
        log.debug(`Error encoding new track: ${err}`);
        next(err);
      });
  });
});

const update_track = handleErrorAsync(async (req, res, next) => {
  const request = {
    trackId: req.body.trackId,
    title: req.body.title,
    order: req.body.order,
  };

  if (!request.trackId) {
    return res.status(400).send("trackId is required");
  }

  log.debug(`Editing track ${request.trackId}`);
  db.knex("track")
    .where("id", "=", request.trackId)
    .update(
      {
        title: request.title,
        order: request.order,
        updated_at: db.knex.fn.now(),
      },
      [
        "id",
        "artist_id",
        "album_id",
        "live_url",
        "title",
        "order",
        "duration",
        "size",
      ]
    )
    .then((data) => {
      res.send(data);
    })
    .catch((err) => {
      log.debug(`Error editing track ${request.trackId}: ${err}`);
      next(err);
    });
});

async function getAlbumDetails(albumId) {
  return db
    .knex("album")
    .join("artist", "album.artist_id", "=", "artist.id")
    .select("artist.id as artistId", "album.title as albumTitle")
    .where("album.id", "=", albumId)
    .first()
    .then((data) => {
      console.log(data);
      return data;
    })
    .catch((err) => {
      log.error(`Error finding artistId from albumId ${err}`);
    });
}

export default {
  get_index_top,
  get_track,
  delete_track,
  create_track,
  update_track,
};

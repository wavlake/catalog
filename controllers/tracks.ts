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
const asyncHandler = require("express-async-handler");
import { formatError } from "../library/errors";

const randomSampleSize = process.env.RANDOM_SAMPLE_SIZE;

const s3BucketName = `${process.env.AWS_S3_BUCKET_NAME}`;
const cdnDomain = `${process.env.AWS_CDN_DOMAIN}`;
const trackPrefix = `${process.env.AWS_S3_TRACK_PREFIX}`;
const rawPrefix = `${process.env.AWS_S3_RAW_PREFIX}`;
const localConvertPath = `${process.env.LOCAL_CONVERT_PATH}`;
const localUploadPath = `${process.env.LOCAL_UPLOAD_PATH}`;

const get_track = asyncHandler(async (req, res, next) => {
  const request = {
    trackId: req.params.trackId,
  };

  const track = await prisma.trackInfo.findFirstOrThrow({
    where: { id: request.trackId },
  });

  res.json({ success: true, data: track });
});

const get_tracks_by_account = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
  };

  const tracks = await prisma.user.findMany({
    where: { id: request.userId },
    include: {
      artist: {
        include: {
          album: {
            where: { deleted: false },
            include: { track: { where: { deleted: false } } },
          },
        },
      },
    },
  });

  res.json({ success: true, data: tracks });
});

const get_tracks_by_album_id = asyncHandler(async (req, res, next) => {
  const request = {
    albumId: req.params.albumId,
  };

  const tracks = await prisma.trackInfo.findMany({
    where: { albumId: request.albumId },
    orderBy: { order: "asc" },
  });

  res.json({ success: true, data: tracks });
});

const get_tracks_by_new = asyncHandler(async (req, res, next) => {
  const request = {
    limit: req.query.limit ? req.query.limit : 50,
    // sortBy: req.body.sortBy
  };

  const albumTracks = db.knex
    .select("track.id as id", "track.album_id as albumId")
    .join("artist", "track.artist_id", "=", "artist.id")
    .join("album", "album.id", "=", "track.album_id")
    .rank("ranking", "track.id", "track.album_id")
    .min("track.title as title")
    .min("artist.name as artist")
    .min("artist.artist_url as artistUrl")
    .min("artist.artwork_url as avatarUrl")
    .min("album.artwork_url as artworkUrl")
    .min("album.title as albumTitle")
    .min("track.live_url as liveUrl")
    .min("track.duration as duration")
    .min("track.created_at as createdAt")
    .andWhere("track.deleted", "=", false)
    .andWhere("track.order", "=", 1)
    .from("track")
    .groupBy("track.album_id", "track.id")
    .as("a");

  db.knex(albumTracks)
    .orderBy("createdAt", "desc")
    .where("ranking", "=", 1)
    .limit(request.limit)
    .then((data) => {
      // console.log(data);
      res.send({ success: true, data: data });
    })
    .catch((err) => {
      log.debug(`Error querying track table for New: ${err}`);
      next(err);
    });
});

const get_tracks_by_random = asyncHandler(async (req, res, next) => {
  const request = {
    limit: req.query.limit ? req.query.limit : 100,
  };

  // NOTES: https://www.redpill-linpro.com/techblog/2021/05/07/getting-random-rows-faster.html

  const randomTracks = db.knex
    .select(
      "track.id as id",
      "track.title as title",
      "artist.name as artist",
      "artist.artist_url as artistUrl",
      "artist.artwork_url as avatarUrl",
      "artist.id as artistId",
      "artist.user_id as ownerId",
      "album.id as albumId",
      "album.artwork_url as artworkUrl",
      "album.title as albumTitle",
      "track.live_url as liveUrl",
      "track.duration as duration"
    )
    .from(db.knex.raw(`track TABLESAMPLE BERNOULLI(${randomSampleSize})`))
    .join("amp", "amp.track_id", "=", "track.id")
    .join("artist", "track.artist_id", "=", "artist.id")
    .join("album", "album.id", "=", "track.album_id");

  randomTracks
    .distinct()
    .where("track.deleted", "=", false)
    // .limit(request.limit)
    .then((data) => {
      res.send(shuffle(data));
    })
    .catch((err) => {
      log.debug(`Error querying track table for Boosted: ${err}`);
      next(err);
    });
});

const get_tracks_by_artist_id = asyncHandler(async (req, res, next) => {
  const request = {
    artistId: req.params.artistId,
    limit: req.query.limit ? parseInt(req.query.limit) : 10,
  };

  const tracks = await prisma.trackInfo.findMany({
    where: { artistId: request.artistId },
    orderBy: { msatTotal30Days: "desc" },
    take: request.limit,
  });

  res.json({ success: true, data: tracks });
});

const delete_track = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req.uid,
    trackId: req.params.trackId,
  };

  if (!request.trackId) {
    const error = formatError(403, "trackId field is required");
    throw error;
  }

  // Check if user owns track
  const isTrackOwner = await getTrackAccount(request.userId, request.trackId);

  if (!isTrackOwner) {
    const error = formatError(403, "User does not own this track");
    throw error;
  }

  log.debug(`Deleting track ${request.trackId}`);
  db.knex("track")
    .where("id", "=", request.trackId)
    .update({ deleted: true }, ["id", "title", "album_id as albumId"])
    .then((data) => {
      res.send({ success: true, data: data[0] });
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
const create_track = asyncHandler(async (req, res, next) => {
  const request = {
    audio: req.file,
    albumId: req.body.albumId,
    title: req.body.title,
    userId: req.uid,
    order: req.body.order,
    lyrics: req.body.lyrics,
  };

  if (!request.albumId) {
    const error = formatError(403, "albumId field is required");
    throw error;
  }

  const albumAccount = await getAlbumAccount(request.userId, request.albumId);

  if (!albumAccount == request.userId) {
    const error = formatError(403, "User does not own this album");
    throw error;
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
                      lyrics: request.lyrics,
                    },
                    ["*"]
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

                    res.send({
                      success: true,
                      data: {
                        id: data[0]["id"],
                        artistId: data[0]["artist_id"],
                        albumId: data[0]["album_id"],
                        title: data[0]["title"],
                        order: data[0]["order"],
                        duration: data[0]["duration"],
                        liveUrl: data[0]["liveUrl"],
                        rawUrl: data[0]["raw_url"],
                        size: data[0]["size"],
                        lyrics: data[0]["lyrics"],
                      },
                    });
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

const update_track = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req.uid,
    trackId: req.body.trackId,
    title: req.body.title,
    order: req.body.order,
    lyrics: req.body.lyrics,
  };

  if (!request.trackId) {
    const error = formatError(403, "trackId field is required");
    throw error;
  }

  // Check if user owns track
  const isTrackOwner = await getTrackAccount(request.userId, request.trackId);

  if (!isTrackOwner) {
    const error = formatError(403, "User does not own this track");
    throw error;
  }

  log.debug(`Editing track ${request.trackId}`);
  db.knex("track")
    .where("id", "=", request.trackId)
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
          artistId: data[0]["artist_id"],
          albumId: data[0]["album_id"],
          title: data[0]["title"],
          order: data[0]["order"],
          duration: data[0]["duration"],
          liveUrl: data[0]["liveUrl"],
          rawUrl: data[0]["raw_url"],
          size: data[0]["size"],
          lyrics: data[0]["lyrics"],
        },
      });
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
      return data;
    })
    .catch((err) => {
      log.error(`Error finding artistId from albumId ${err}`);
    });
}

// Durstenfeld Shuffle, via: https://stackoverflow.com/a/12646864
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export default {
  get_track,
  get_tracks_by_account,
  get_tracks_by_new,
  get_tracks_by_random,
  get_tracks_by_album_id,
  get_tracks_by_artist_id,
  delete_track,
  create_track,
  update_track,
};

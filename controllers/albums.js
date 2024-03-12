const log = require("loglevel");
import db from "../library/db";
const { randomUUID } = require("crypto");
const fs = require("fs");
const multer = require("multer");
const Jimp = require("jimp");
const s3Client = require("../library/s3Client");
import prisma from "../prisma/client";
import { validate } from "uuid";
import { isAlbumOwner, isArtistOwner } from "../library/userHelper";
const asyncHandler = require("express-async-handler");
import { formatError } from "../library/errors";
import { getStatus } from "../library/helpers";
import { AWS_S3_IMAGE_PREFIX } from "../library/constants";
import { getAllComments } from "../library/comments";
const { invalidateCdn } = require("../library/cloudfrontClient");

const localConvertPath = `${process.env.LOCAL_CONVERT_PATH}`;
const cdnDomain = `${process.env.AWS_CDN_DOMAIN}`;

const get_albums_by_account = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
  };

  db.knex("user")
    .join("artist", "user.id", "=", "artist.user_id")
    .join("album", "artist.id", "=", "album.artist_id")
    .leftOuterJoin("music_genre", "album.genre_id", "=", "music_genre.id")
    .leftOuterJoin(
      "music_subgenre",
      "album.subgenre_id",
      "=",
      "music_subgenre.id"
    )
    .select(
      "album.id as id",
      "album.title as title",
      "album.artwork_url as artworkUrl",
      "artist.name as name",
      "music_genre.id as genreId",
      "music_subgenre.id as subgenreId",
      "album.is_draft as isDraft",
      "album.published_at as publishedAt",
      "album.is_single as isSingle"
    )
    .where("user.id", "=", request.userId)
    .andWhere("album.deleted", "=", false)
    .then((data) => {
      // console.log(data)
      res.send({
        success: true,
        data: data.map((album) => ({
          ...album,
          status: getStatus(album.isDraft, album.publishedAt),
        })),
      });
    })
    .catch((err) => {
      next(err);
    });
});

const get_albums_by_genre_id = asyncHandler(async (req, res, next) => {
  const request = {
    genreId: parseInt(req.params.genreId),
    // limit: req.query.limit ? req.query.limit : 10,
    // sortBy: req.body.sortBy
  };

  const albums = await prisma.album.findMany({
    select: {
      artist: {
        select: {
          id: true,
          name: true,
        },
      },
      id: true,
      title: true,
      artworkUrl: true,
    },
    where: {
      genreId: request.genreId,
      deleted: false,
      isDraft: false,
      publishedAt: { lte: new Date() },
    },
  });

  res.json({ success: true, data: albums });
});

const get_album_by_id = asyncHandler(async (req, res, next) => {
  const request = {
    albumId: req.params.albumId,
  };

  if (!validate(request.albumId)) {
    res.status(400).json({
      success: false,
      error: "Invalid albumId",
    });
    return;
  }

  const album = await prisma.album
    .findFirstOrThrow({
      where: { id: request.albumId },
      // include artist.userId at the top level of the album
      include: {
        artist: {
          select: {
            userId: true,
          },
        },
      },
    })
    .catch((err) => {
      // Prisma will throw an error if the uuid is not found or not a valid uuid
      res.status(400).json({
        success: false,
        error: "No album found with that id",
      });
      return;
    });

  if (!album) {
    return;
  }

  const albumTrackIds = await prisma.track.findMany({
    where: {
      albumId: request.albumId,
      isDraft: false,
      deleted: false,
      publishedAt: { lte: new Date() },
    },
    select: { id: true },
  });

  const comments = await getAllComments(
    albumTrackIds.map((track) => track.id),
    10
  );

  res.json({
    success: true,
    data: {
      ...album,
      topMessages: comments,
    },
  });
});

const get_albums_by_artist_id = asyncHandler(async (req, res, next) => {
  const request = {
    artistId: req.params.artistId,
    // limit: req.query.limit ? req.query.limit : 10,
    // sortBy: req.body.sortBy
  };
  const { unpublished } = req.query;

  const albums = await prisma.album.findMany({
    where: {
      artistId: request.artistId,
      deleted: false,
      ...(unpublished
        ? {}
        : { isDraft: false, publishedAt: { lte: new Date() } }),
    },
  });

  res.json({ success: true, data: albums });
});

const create_album = asyncHandler(async (req, res, next) => {
  const newAlbumId = randomUUID();

  const request = {
    userId: req["uid"],
    artwork: req.file,
    artistId: req.body.artistId,
    title: req.body.title,
    genreId: req.body.genreId,
    subgenreId: req.body.subgenreId,
    description: req.body.description,
    isDraft: req.body.isDraft,
    isSingle: req.body.isSingle ?? false,
  };

  // Check if user owns artist
  const isOwner = await isArtistOwner(request.userId, request.artistId);

  if (!isOwner) {
    const error = formatError(403, "User does not own this artist");
    next(error);
    return;
  }

  let uploadPath;
  let isKeeper = false;
  if (!request.artwork) {
    uploadPath = "./graphics/wavlake-icon-750.png";
    isKeeper = true;
  } else {
    uploadPath = request.artwork.path;
  }

  const convertPath = `${localConvertPath}/${newAlbumId}.jpg`;
  const s3Key = `${AWS_S3_IMAGE_PREFIX}/${newAlbumId}.jpg`;

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
                genre_id: request.genreId,
                subgenre_id: request.subgenreId,
                is_draft: request.isDraft,
                published_at: db.knex.fn.now(),
                is_single: request.isSingle,
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
                success: true,
                data: {
                  id: data[0]["id"],
                  title: data[0]["title"],
                  artworkUrl: data[0]["artwork_url"],
                  artistId: data[0]["artist_id"],
                  description: data[0]["description"],
                  genreId: data[0]["genre_id"],
                  subgenreId: data[0]["subgenre_id"],
                  isDraft: data[0]["is_draft"],
                  publishedAt: data[0]["published_at"],
                  isSingle: data[0]["is_single"],
                },
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

const update_album = asyncHandler(async (req, res, next) => {
  const {
    albumId,
    title,
    description,
    genreId,
    subgenreId,
    isDraft,
    // TODO consume this when scheduling is implemented
    // ensure time zones are properly handled
    publishedAt: publishedAtString,
    isSingle,
  } = req.body;
  const uid = req["uid"];
  const updatedAt = new Date();

  if (!albumId) {
    const error = formatError(400, "albumId field is required");
    next(error);
    return;
  }

  if (!validate(albumId)) {
    res.status(400).json({
      success: false,
      error: "Invalid albumId",
    });
    return;
  }

  // Check if user owns album
  const isOwner = await isAlbumOwner(uid, albumId);

  if (!isOwner) {
    const error = formatError(403, "User does not own this album");
    next(error);
    return;
  }

  log.debug(`Editing album ${albumId}`);
  const updatedAlbum = await prisma.album.update({
    where: {
      id: albumId,
    },
    data: {
      title,
      description,
      updatedAt,
      genreId,
      subgenreId,
      isDraft,
      isSingle,
    },
  });
  res.json({
    success: true,
    data: updatedAlbum,
  });
});

const update_album_art = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
    artwork: req.file,
    albumId: req.body.albumId,
  };

  if (!request.albumId) {
    res.status(400).send("albumId is required");
  }

  if (!validate(request.albumId)) {
    res.status(400).json({
      success: false,
      error: "Invalid albumId",
    });
    return;
  }

  // Check if user owns album
  const isOwner = await isAlbumOwner(request.userId, request.albumId);

  if (!isOwner) {
    const error = formatError(403, "User does not own this album");
    next(error);
    return;
  }

  const uploadPath = request.artwork.path;

  const convertPath = `${localConvertPath}/${request.albumId}.jpg`;
  const s3Key = `${AWS_S3_IMAGE_PREFIX}/${request.albumId}.jpg`;

  log.debug(`Editing album artwork ${request.albumId}`);

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
          `Artwork for ${request.albumId} uploaded to S3 ${data.Location}, refreshing cache...`
        );
        invalidateCdn(s3Key);
      });
    })
    .then(() => {
      const liveUrl = `${cdnDomain}/${s3Key}`;
      db.knex("album")
        .where("id", "=", request.albumId)
        .update({ artwork_url: liveUrl, updated_at: db.knex.fn.now() }, ["id"])
        .then((data) => {
          res.send({ success: true, data: data[0] });
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

const delete_album = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
    albumId: req.params.albumId,
  };

  if (!request.albumId) {
    res.status(400).send("albumId is required");
  }

  if (!validate(request.albumId)) {
    res.status(400).json({
      success: false,
      error: "Invalid albumId",
    });
    return;
  }

  // Check if user owns album
  const isOwner = await isAlbumOwner(request.userId, request.albumId);

  if (!isOwner) {
    const error = formatError(403, "User does not own this album");
    next(error);
    return;
  }

  log.debug(`Checking tracks for album ${request.albumId}`);
  db.knex("track")
    .select("track.album_id as albumId", "track.deleted")
    .where("track.album_id", "=", request.albumId)
    .andWhere("track.deleted", false)
    .then((data) => {
      if (data.length > 0) {
        const error = formatError(500, "Album must be empty to delete");
        next(error);
        return;
      } else {
        log.debug(`Deleting album ${request.albumId}`);
        db.knex("album")
          .where("id", "=", request.albumId)
          .update({ deleted: true }, ["id", "title"])
          .then((data) => {
            res.send({ success: true, data: data[0] });
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
});

export default {
  get_albums_by_account,
  get_albums_by_genre_id,
  get_album_by_id,
  delete_album,
  create_album,
  update_album,
  update_album_art,
  get_albums_by_artist_id,
};

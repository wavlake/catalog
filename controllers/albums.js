const log = require("loglevel");
import db from "../library/db";
const { randomUUID } = require("crypto");
const multer = require("multer");
import prisma from "../prisma/client";
import { validate } from "uuid";
import { isAlbumOwner, isArtistOwner } from "../library/userHelper";
const asyncHandler = require("express-async-handler");
import { formatError } from "../library/errors";
import { getStatus } from "../library/helpers";
import { getAllComments } from "../library/comments";
import { upload_image } from "../library/artwork";

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
      "album.updated_at as updatedAt",
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
    isSingle: req.body.isSingle ?? false,
  };

  // Check if user owns artist
  const isOwner = await isArtistOwner(request.userId, request.artistId);

  if (!isOwner) {
    const error = formatError(403, "User does not own this artist");
    next(error);
    return;
  }

  const cdnImageUrl = await upload_image(request.artwork, newAlbumId, "album");

  return db
    .knex("album")
    .insert(
      {
        id: newAlbumId,
        artist_id: request.artistId,
        title: request.title,
        description: request.description,
        artwork_url: cdnImageUrl,
        genre_id: request.genreId,
        subgenre_id: request.subgenreId,
        // all newly created content starts a draft, user must publish after creation
        is_draft: true,
        is_single: Boolean(request.isSingle),
      },
      ["*"]
    )
    .then((data) => {
      log.debug(`Created new album ${request.title} with id: ${data[0]["id"]}`);

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
      } else if (err) {
        log.debug(`Error creating new album: ${err}`);
      }
      res.status(500).json({
        success: false,
        error: "Something went wrong creating the album.",
      });
    });
});

const update_album = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
    artwork: req.file,
    albumId: req.body.albumId,
    title: req.body.title,
    genreId: req.body.genreId,
    subgenreId: req.body.subgenreId,
    description: req.body.description,
    isSingle: req.body.isSingle ?? false,
  };

  const artwork = req.file;
  const updatedAt = new Date();

  if (!request.albumId) {
    const error = formatError(400, "albumId field is required");
    next(error);
    return;
  }

  if (!validate(request.albumId)) {
    res.status(400).json({
      success: false,
      error: "Invalid albumId",
    });
    return;
  }

  const newGenreId = request.genreId ? parseInt(request.genreId) : undefined;
  const newSubgenreId = request.subgenreId
    ? parseInt(request.subgenreId)
    : undefined;
  if (
    (request.genreId && !newGenreId) ||
    (request.subgenreId && !newSubgenreId)
  ) {
    const error = formatError(
      400,
      "Invalid genre or subgenre id. If included, these fields must be integers."
    );
    next(error);
    return;
  }

  // Check if user owns album
  const isOwner = await isAlbumOwner(request.userId, request.albumId);

  if (!isOwner) {
    const error = formatError(403, "User does not own this album");
    next(error);
    return;
  }
  const cdnImageUrl = artwork
    ? await upload_image(artwork, request.albumId, "album")
    : undefined;

  log.debug(`Editing album ${request.albumId}`);
  const updatedAlbum = await prisma.album.update({
    where: {
      id: request.albumId,
    },
    data: {
      title: request.title,
      description: request.description,
      updatedAt,
      genreId: newGenreId,
      subgenreId: newSubgenreId,
      isSingle: Boolean(request.isSingle),
      ...(cdnImageUrl ? { artworkUrl: cdnImageUrl } : {}),
    },
  });
  res.json({
    success: true,
    data: updatedAlbum,
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
  get_albums_by_artist_id,
};

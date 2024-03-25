const log = require("loglevel");
import db from "../library/db";
const { randomUUID } = require("crypto");
import multer from "multer";
const format = require("../library/format");
import { isArtistOwner } from "../library/userHelper";
import { validate } from "uuid";
import prisma from "../prisma/client";
const asyncHandler = require("express-async-handler");
import { formatError } from "../library/errors";
const Sentry = require("@sentry/node");
import { getAllComments } from "../library/comments";
import { upload_image } from "../library/artwork";

const get_artist_by_url = asyncHandler(async (req, res, next) => {
  const request = {
    artistUrl: req.params.artistUrl,
  };

  const artist = await prisma.artist
    .findFirstOrThrow({
      where: { artistUrl: request.artistUrl },
    })
    .catch((e) => {
      res.status(400).json({
        success: false,
        error: "No artist found with that url",
      });
      return;
    });

  if (!artist) {
    return;
  }

  res.json({ success: true, data: artist });
});

const get_artist_by_id = asyncHandler(async (req, res, next) => {
  const { artistId } = req.params;

  if (!validate(artistId)) {
    res.status(400).json({
      success: false,
      error: "Invalid artistId",
    });
    return;
  }

  const artist = await prisma.artist.findFirstOrThrow({
    where: { id: artistId },
  });

  const albums = await prisma.album.findMany({
    where: {
      artistId: artistId,
      deleted: false,
      isDraft: false,
      publishedAt: { lte: new Date() },
    },
    orderBy: { createdAt: "desc" },
    take: 3,
  });

  const tracks = await prisma.trackInfo.findMany({
    where: {
      artistId: artistId,
      isDraft: false,
      publishedAt: { lte: new Date() },
    },
    orderBy: { msatTotal: "desc" },
    take: 10,
  });

  const comments = await getAllComments(
    tracks.map(({ id }) => id),
    7
  );

  res.json({
    success: true,
    data: {
      ...artist,
      topAlbums: albums,
      topTracks: tracks,
      topMessages: comments,
    },
  });
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
    return;
  }

  const cdnImageUrl = await upload_image(
    request.artwork,
    newArtistId,
    "artist"
  );

  return db
    .knex("artist")
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
        artwork_url: cdnImageUrl,
        artist_url: format.urlFriendly(request.name),
      },
      ["*"]
    )
    .then((data) => {
      log.debug(`Created new artist ${request.name} with id: ${data[0]["id"]}`);

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

        res.status(500).send("Something went wrong");
      } else {
        log.debug(`Error creating new artist: ${err}`);
        if (err.message.includes("duplicate")) {
          res.status(400).json({
            success: false,
            error: "Duplicate artist.",
          });
        } else {
          res.status(500).json({
            success: false,
            error: "Something went wrong creating the artist.",
          });
        }
      }
    });
});

const search_artists_by_name = asyncHandler(async (req, res, next) => {
  const name = String(req.query.name);

  if (!name) {
    const error = formatError(400, "name field is required");
    next(error);
    return;
  }

  // TODO: Sort results by sats?
  const artists = await prisma.artist.findMany({
    where: { name: { contains: name, mode: "insensitive" }, deleted: false },
    take: 10,
  });

  res.json({ success: true, data: artists });
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
    artwork: req.file,
  };
  const artwork = req.file;
  const updatedAt = new Date();

  if (!request.artistId) {
    const error = formatError(403, "artistId field is required");
    next(error);
    return;
  }

  // Check if user owns artist
  const isOwner = await isArtistOwner(request.userId, request.artistId);

  if (!isOwner) {
    const error = formatError(403, "User does not own this artist");
    next(error);
    return;
  }

  const cdnImageUrl = artwork
    ? await upload_image(artwork, request.albumId, "artist")
    : undefined;

  log.debug(`Editing artist ${request.artistId}`);
  return db
    .knex("artist")
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
        ...(cdnImageUrl ? { artwork_url: cdnImageUrl } : {}),
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
      res.status(500).json({
        success: false,
        error: "Something went wrong creating the artist.",
      });
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
    return;
  }

  // Check if user owns artist
  const isOwner = await isArtistOwner(request.userId, request.artistId);

  if (!isOwner) {
    const error = formatError(403, "User does not own this artist");
    next(error);
    return;
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
  search_artists_by_name,
  update_artist,
  delete_artist,
};

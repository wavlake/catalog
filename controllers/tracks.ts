import prisma from "../prisma/client";
import db from "../library/db";
import log from "loglevel";
import { randomUUID } from "crypto";
import s3Client from "../library/s3Client";
import { isAlbumOwner, isTrackOwner } from "../library/userHelper";
import asyncHandler from "express-async-handler";
import { formatError } from "../library/errors";
import { parseLimit } from "../library/helpers";
import { AWS_S3_RAW_PREFIX, AWS_S3_TRACK_PREFIX } from "../library/constants";

const randomSampleSize = process.env.RANDOM_SAMPLE_SIZE;

const s3BucketName = `${process.env.AWS_S3_BUCKET_NAME}`;
const cdnDomain = `${process.env.AWS_CDN_DOMAIN}`;

const get_track = asyncHandler(async (req, res, next) => {
  const { trackId } = req.params;

  if (!trackId) {
    const error = formatError(400, "trackId is required");
    next(error);
    return;
  }

  prisma.trackInfo
    .findFirstOrThrow({
      where: { id: trackId },
    })
    .then((track) => {
      res.json({ success: true, data: track });
    })
    .catch((err) => {
      // Prisma will throw an error if the uuid is not found or not a valid uuid
      const error = formatError(404, `Track not found for id: ${trackId}`);
      next(error);
      return;
    });
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
  const { unpublished } = req.query;

  const tracks = await prisma.trackInfo.findMany({
    where: {
      albumId: request.albumId,
      ...(unpublished
        ? {}
        : {
            isProcessing: false,
            isDraft: false,
            publishedAt: { lte: new Date() },
          }),
    },
    orderBy: { order: "asc" },
  });

  res.json({ success: true, data: tracks });
});

const get_tracks_by_new = asyncHandler(async (req, res, next) => {
  const limit = parseLimit(req.query.limit, 50);

  const albumTracks = db.knex
    .select(
      "track.id as id",
      "track.album_id as albumId",
      "artist.id as artistId"
    )
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
    .andWhere("track.published_at", "<", new Date())
    .andWhere("track.is_draft", "=", false)
    .andWhere("album.published_at", "<", new Date())
    .andWhere("album.is_draft", "=", false)
    .andWhere("track.deleted", "=", false)
    .andWhere("track.order", "=", 1)
    .andWhere("track.duration", "is not", null)
    .from("track")
    .groupBy("track.album_id", "track.id", "artist.id")
    .as("a");

  db.knex(albumTracks)
    .orderBy("createdAt", "desc")
    .where("ranking", "=", 1)
    .limit(limit)
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
    .andWhere("track.published_at", "<", new Date())
    .andWhere("track.is_draft", "=", false)
    .andWhere("album.published_at", "<", new Date())
    .andWhere("album.is_draft", "=", false)
    .andWhere("track.duration", "is not", null)
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
  const { artistId } = req.params;
  const { unpublished } = req.query;

  const limit = parseLimit(req.query.limit);

  const tracks = await prisma.trackInfo.findMany({
    where: {
      artistId: artistId,
      isProcessing: false,
      ...(unpublished
        ? {}
        : { isDraft: false, publishedAt: { lte: new Date() } }),
    },
    orderBy: { msatTotal30Days: "desc" },
    take: limit,
  });

  res.json({ success: true, data: tracks });
});

const get_random_tracks_by_genre_id = asyncHandler(async (req, res, next) => {
  const { genreId } = req.params;

  // get the total number of tracks in the genre
  const trackCount = await db
    .knex("track")
    .join("album", "album.id", "=", "track.album_id")
    .join("music_genre", "music_genre.id", "=", "album.genre_id")
    .where("music_genre.id", "=", genreId)
    .andWhere("track.deleted", "=", false)
    .andWhere("track.duration", "is not", null)
    .count("track.id as count")
    .first();

  if (!trackCount?.count || trackCount.count === 0) {
    res.send({ success: true, data: [] });
    return;
  }

  // the target number of tracks to return
  const sampleSizeTarget = 100;
  // 7% buffer to account for TABLESAMPLE BERNOULLI not being exact
  const sampleSizeBuffer = 7;
  // the total number of tracks in the genre
  const numberOfTracks = trackCount.count as number;

  // sample size can range from 0 - 100%
  const sampleSize =
    // if we have more than 100 tracks, we can take a sample
    numberOfTracks > sampleSizeTarget
      ? // calculate the sample size % based on the target and buffer
        sampleSizeBuffer + (100 * sampleSizeTarget) / numberOfTracks
      : // return 100% of the tracks since there arent enough to meet the target
        100;

  db.knex(db.knex.raw(`track TABLESAMPLE BERNOULLI(${sampleSize})`))
    .join("album", "album.id", "=", "track.album_id")
    .join("artist", "artist.id", "=", "track.artist_id")
    .join("music_genre", "music_genre.id", "=", "album.genre_id")
    .where("music_genre.id", "=", genreId)
    .andWhere("track.deleted", "=", false)
    .andWhere("track.duration", "is not", null)
    .select(
      "track.id as id",
      "track.title as title",
      "artist.name as artist",
      "artist.artist_url as artistUrl",
      "artist.artwork_url as avatarUrl",
      "track.album_id as albumId",
      "album.artwork_url as artworkUrl",
      "album.title as albumTitle",
      "track.live_url as liveUrl",
      "track.duration as duration",
      "artist.id as artistId"
    )
    .limit(100)
    .then((data) => {
      res.send(shuffle(data));
    })
    .catch((err) => {
      log.debug(`Error querying random genre tracks: ${err}`);
      next(err);
    });
});

const delete_track = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
    trackId: req.params.trackId,
  };

  if (!request.trackId) {
    const error = formatError(400, "trackId field is required");
    next(error);
    return;
  }

  // Check if user owns track
  const isOwner = await isTrackOwner(request.userId, request.trackId);

  if (!isOwner) {
    const error = formatError(403, "User does not own this track");
    next(error);
    return;
  }

  log.debug(`Deleting track ${request.trackId}`);
  db.knex("track")
    .where("id", "=", request.trackId)
    .update({ deleted: true }, ["id", "title", "album_id as albumId"])
    .then(async (data) => {
      const updatedAt = new Date();
      // update the album's updatedAt field
      await prisma.album.update({
        where: { id: data[0].albumId },
        data: { updatedAt },
      });
      res.send({ success: true, data: data[0] });
    })
    .catch((err) => {
      log.debug(`Error deleting track ${request.trackId}: ${err}`);
      next(err);
    });
});

const create_track = asyncHandler(async (req, res, next) => {
  const request = {
    albumId: req.body.albumId,
    title: req.body.title,
    userId: req["uid"],
    order: req.body.order == "" ? 0 : parseInt(req.body.order),
    lyrics: req.body.lyrics,
    extension: req.body.extension ?? "mp3",
  };

  if (!request.albumId) {
    const error = formatError(400, "albumId field is required");
    next(error);
    return;
  }

  const albumAccount = await isAlbumOwner(request.userId, request.albumId);

  if (!albumAccount === request.userId) {
    const error = formatError(403, "User does not own this album");
    next(error);
    return;
  }

  const albumDetails = await getAlbumDetails(request.albumId);

  const newTrackId = randomUUID();

  const s3RawKey = `${AWS_S3_RAW_PREFIX}/${newTrackId}`;
  const s3RawUrl = `https://${s3BucketName}.s3.us-east-2.amazonaws.com/${AWS_S3_RAW_PREFIX}/${newTrackId}.${request.extension}`;
  const s3Key = `${AWS_S3_TRACK_PREFIX}/${newTrackId}.mp3`;

  const presignedUrl = await s3Client.generatePresignedUrl({
    key: s3RawKey,
    extension: request.extension,
  });

  const liveUrl = `${cdnDomain}/${s3Key}`;

  if (presignedUrl == null) {
    const error = formatError(500, "Error generating presigned URL");
    next(error);
    return;
  }

  const duplicateTitledTrack = await db
    .knex("track")
    .where("artist_id", "=", albumDetails.artistId)
    .andWhere("title", "=", request.title)
    .andWhere("deleted", "=", false)
    .first();

  if (duplicateTitledTrack) {
    const error = formatError(
      400,
      "Please pick another title, this artist already has a track with that title."
    );
    next(error);
    return;
  }

  db.knex("track")
    .insert(
      {
        id: newTrackId,
        artist_id: albumDetails.artistId,
        album_id: request.albumId,
        live_url: liveUrl,
        title: request.title,
        order: request.order,
        lyrics: request.lyrics,
        raw_url: s3RawUrl,
        is_processing: true,
      },
      ["*"]
    )
    .then(async (data) => {
      const updatedAt = new Date();

      log.debug(`Created new track ${request.title} with id: ${data[0]["id"]}`);

      // update the album's updatedAt field
      await prisma.album.update({
        where: { id: request.albumId },
        data: { updatedAt },
      });

      res.send({
        success: true,
        data: {
          id: data[0]["id"],
          artistId: data[0]["artist_id"],
          albumId: data[0]["album_id"],
          title: data[0]["title"],
          order: data[0]["order"],
          liveUrl: data[0]["liveUrl"],
          rawUrl: data[0]["raw_url"],
          lyrics: data[0]["lyrics"],
          presignedUrl: presignedUrl,
        },
      });
    })
    .catch((err) => {
      const error = formatError(500, `Error creating new: ${err}`);
      next(error);
    });
});

// only returns published and non-draft tracks
const search_tracks = asyncHandler(async (req, res, next) => {
  const title = String(req.query.title);
  const artist = String(req.query.artist);
  const album = String(req.query.album);

  if (!title && !artist && !album) {
    const error = formatError(
      400,
      "Must include at least one search query. Either title, artist, or album"
    );
    next(error);
    return;
  }

  const tracks = await prisma.trackInfo.findMany({
    where: {
      OR: [
        { title: { contains: title, mode: "insensitive" } },
        {
          artist: { contains: artist, mode: "insensitive" },
        },
        { albumTitle: { contains: album, mode: "insensitive" } },
      ],
      isProcessing: false,
      isDraft: false,
      publishedAt: { lte: new Date() },
    },
    take: 10,
  });

  res.json({ success: true, data: tracks });
});

const update_track = asyncHandler(async (req, res, next) => {
  const {
    trackId,
    title,
    order,
    lyrics,
    isDraft,
    publishedAt: publishedAtString,
  } = req.body;
  const uid = req["uid"];

  const publishedAt = publishedAtString
    ? new Date(publishedAtString)
    : undefined;
  const updatedAt = new Date();

  if (!trackId) {
    const error = formatError(400, "trackId field is required");
    next(error);
    return;
  }

  // Check if user owns track
  const isOwner = await isTrackOwner(uid, trackId);

  if (!isOwner) {
    const error = formatError(403, "User does not own this track");
    next(error);
    return;
  }

  const unEditedTrack = await prisma.track.findFirst({
    where: { id: trackId },
  });

  // if we dont have a track match, return a 404
  if (!unEditedTrack) {
    const error = formatError(404, `Track not found for id: ${trackId}`);
    next(error);
    return;
  }

  // if we are updating the title, check if the artist already has a track with that title
  if (title !== undefined) {
    const duplicateTitledTrack = await db
      .knex("track")
      .where("artist_id", "=", unEditedTrack.artistId)
      .andWhere("title", "=", title)
      .andWhere("deleted", "=", false)
      .first();

    if (duplicateTitledTrack) {
      const error = formatError(
        400,
        "Please pick another title, this artist already has a track with that title."
      );
      next(error);
      return;
    }
  }

  log.debug(`Editing track ${trackId}`);
  try {
    const updatedTrack = await prisma.track.update({
      where: {
        id: trackId,
      },
      data: {
        title,
        order,
        lyrics,
        updatedAt,
        isDraft,
        publishedAt,
      },
    });

    // update the album's updatedAt field
    await prisma.album.update({
      where: { id: updatedTrack.albumId },
      data: { updatedAt },
    });

    res.json({ success: true, data: updatedTrack });
  } catch (err) {
    log.debug(`Error editing track ${trackId}: ${err}`);
    next(err);
  }
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
  search_tracks,
  get_tracks_by_album_id,
  get_tracks_by_artist_id,
  get_random_tracks_by_genre_id,
  delete_track,
  create_track,
  update_track,
};

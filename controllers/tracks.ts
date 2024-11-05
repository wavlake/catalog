import prisma from "../prisma/client";
import db from "../library/db";
import log from "loglevel";
import { Event } from "nostr-tools";
import { randomUUID } from "crypto";
import { invalidateCdn } from "../library/cloudfrontClient";
import s3Client from "../library/s3Client";
import { isAlbumOwner, isTrackOwner } from "../library/userHelper";
import { validate } from "uuid";
import asyncHandler from "express-async-handler";
import { parseLimit } from "../library/helpers";
import { AWS_S3_RAW_PREFIX, AWS_S3_TRACK_PREFIX } from "../library/constants";
import { addOP3URLPrefix } from "../library/op3";
import {
  FEATURED_PLAYLIST_ID,
  DEFAULT_FOR_YOU_PLAYLIST_ID,
} from "../library/constants";
import { getPlaylistTracks } from "../library/playlist";
import { getWeeklyTop40 } from "../library/chart";
import { getUserRecentTracks, getNewTracks } from "../library/track";
import { shuffle } from "../library/helpers";

const randomSampleSize = process.env.RANDOM_SAMPLE_SIZE;
const s3BucketName = `${process.env.AWS_S3_BUCKET_NAME}`;
const cdnDomain = `${process.env.AWS_CDN_DOMAIN}`;

const get_featured_tracks = asyncHandler(async (req, res, next) => {
  const { pubkey } = req.params;

  const featuredTracks = await getPlaylistTracks(FEATURED_PLAYLIST_ID);
  const trendingTracks = await getWeeklyTop40();
  const newTracks = await getNewTracks();
  let forYouTracks;
  if (pubkey) {
    log.debug(`Nostr pubkey: ${pubkey}`);
    forYouTracks = await getUserRecentTracks(pubkey);
    if (forYouTracks.length < 3) {
      forYouTracks = await getPlaylistTracks(DEFAULT_FOR_YOU_PLAYLIST_ID);
    }
  } else {
    forYouTracks = await getPlaylistTracks(DEFAULT_FOR_YOU_PLAYLIST_ID);
  }

  const shuffledFeaturedTracks = shuffle(featuredTracks);
  res.send({
    success: true,
    data: {
      featured: shuffledFeaturedTracks,
      forYou: forYouTracks,
      trending: trendingTracks,
      newTracks: newTracks,
    },
  });
});

const get_track = asyncHandler(async (req, res, next) => {
  const { trackId } = req.params;

  if (!trackId) {
    res.status(400).json({
      success: false,
      error: "trackId is required",
    });
    return;
  }

  if (!validate(trackId)) {
    res.status(400).json({
      success: false,
      error: "Invalid trackId",
    });
    return;
  }

  prisma.trackInfo
    .findFirstOrThrow({
      where: { id: trackId },
    })
    .then((track) => {
      // Add OP3 URL prefix to liveUrl
      track.liveUrl = addOP3URLPrefix({
        url: track.liveUrl,
        albumId: track.albumId,
      });
      res.json({ success: true, data: track });
    })
    .catch((err) => {
      // Prisma will throw an error if the uuid is not found or not a valid uuid
      res.status(400).json({
        success: false,
        error: "No track found with that id",
      });
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

  if (!validate(request.albumId)) {
    res.status(400).json({
      success: false,
      error: "Invalid albumId",
    });
    return;
  }

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

  // Add OP3 URL prefix to liveUrl
  tracks.forEach((track) => {
    track.liveUrl = addOP3URLPrefix({
      url: track.liveUrl,
      albumId: track.albumId,
    });
  });

  res.json({ success: true, data: tracks });
});

const get_tracks_by_new = asyncHandler(async (req, res, next) => {
  const limit = parseLimit(req.query.limit, 50);

  const tracks = await getNewTracks(limit);
  // Shuffle the data to get a random order
  const shuffledData = shuffle(tracks);
  res.send({ success: true, data: shuffledData });
});

const get_tracks_by_random = asyncHandler(async (req, res, next) => {
  const trackLimit =
    typeof req.query.limit === "string" ? parseInt(req.query.limit) : 100;

  if (isNaN(trackLimit)) {
    res.status(400).json({
      success: false,
      error: "Limit must be an integer",
    });
    return;
  }
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
      "album.color_info as colorInfo",
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
    .limit(trackLimit)
    .then((data) => {
      // Add OP3 URL prefix to liveUrl
      data.forEach((track) => {
        track.liveUrl = addOP3URLPrefix({
          url: track.liveUrl,
          albumId: track.albumId,
        });
      });
      const shuffledData = shuffle(data);
      res.status(200).json({ success: true, data: shuffledData });
    })
    .catch((err) => {
      log.debug(`Error querying track table for random: ${err}`);
      next(err);
    });
});

const get_tracks_by_artist_id = asyncHandler(async (req, res, next) => {
  const { artistId } = req.params;
  const { unpublished } = req.query;

  if (!validate(artistId)) {
    res.status(400).json({
      success: false,
      error: "Invalid artistId",
    });
    return;
  }

  const limit = parseLimit(req.query.limit);

  const tracks = await prisma.trackInfo.findMany({
    where: {
      artistId: artistId,
      isProcessing: false,
      ...(unpublished
        ? {}
        : { isDraft: false, publishedAt: { lte: new Date() } }),
    },
    orderBy: { msatTotal: "desc" },
    take: limit,
  });

  // Add OP3 URL prefix to liveUrl
  tracks.forEach((track) => {
    track.liveUrl = addOP3URLPrefix({
      url: track.liveUrl,
      albumId: track.albumId,
    });
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
      "album.color_info as colorInfo",
      "album.title as albumTitle",
      "track.live_url as liveUrl",
      "track.duration as duration",
      "artist.id as artistId"
    )
    .limit(100)
    .then((data) => {
      // Add OP3 URL prefix to liveUrl
      data.forEach((track) => {
        track.liveUrl = addOP3URLPrefix({
          url: track.liveUrl,
          albumId: track.albumId,
        });
      });
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
    res.status(400).json({
      success: false,
      error: "trackId field is required",
    });
    return;
  }

  if (!validate(request.trackId)) {
    res.status(400).json({
      success: false,
      error: "Invalid trackId",
    });
    return;
  }

  // Check if user owns track
  const isOwner = await isTrackOwner(request.userId, request.trackId);

  if (!isOwner) {
    res.status(403).json({
      success: false,
      error: "User does not own this track",
    });
    return;
  }

  log.debug(`Deleting track ${request.trackId}`);
  const deleteTrackData = await db
    .knex("track")
    .where("id", "=", request.trackId)
    .update({ deleted: true }, ["id", "title", "album_id as albumId"]);

  if (!deleteTrackData) {
    res.status(404).json({
      success: false,
      error: `Track not found for id: ${request.trackId}`,
    });
    return;
  }
  const updatedAt = new Date();
  // update the album's updatedAt field
  await prisma.album.update({
    where: { id: deleteTrackData[0].albumId },
    data: { updatedAt },
  });

  // Clean up S3 and CDN
  s3Client.deleteFromS3(`${AWS_S3_TRACK_PREFIX}/${request.trackId}.mp3`);
  invalidateCdn(`${AWS_S3_TRACK_PREFIX}/${request.trackId}.mp3`);

  res.send({ success: true, data: deleteTrackData[0] });
});

const create_track = asyncHandler(async (req, res, next) => {
  const request = {
    albumId: req.body.albumId,
    title: req.body.title,
    userId: req["uid"],
    order: req.body.order == "" ? 0 : parseInt(req.body.order),
    lyrics: req.body.lyrics,
    extension: req.body.extension,
    isExplicit: req.body.isExplicit ?? false,
  };

  if (
    !request.extension ||
    !request.title ||
    !request.order ||
    !request.albumId
  ) {
    res.status(400).json({
      success: false,
      error: "albumId, title, order, and extension fields are required",
    });
    return;
  }

  const albumAccount = await isAlbumOwner(request.userId, request.albumId);

  if (!albumAccount === request.userId) {
    res.status(403).json({
      success: false,
      error: "User does not own this album",
    });
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
    res.status(500).json({
      success: false,
      error: "Error generating presigned URL",
    });
    return;
  }

  const duplicateTitledTrack = await db
    .knex("track")
    .where("artist_id", "=", albumDetails.artistId)
    .andWhere("title", "=", request.title)
    .andWhere("deleted", "=", false)
    .first();

  if (duplicateTitledTrack) {
    res.status(400).json({
      success: false,
      error:
        "Please pick another title, this artist already has a track with that title.",
    });
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
        // all newly created content starts a draft, user must publish after creation
        is_draft: true,
        is_explicit: request.isExplicit,
      },
      ["*"]
    )
    .then(async (data) => {
      const updatedAt = new Date();

      log.debug(`Created new track ${request.title} with id: ${data[0]["id"]}`);

      // update the album's updatedAt field
      await prisma.album.update({
        where: { id: request.albumId },
        data: { updatedAt, isFeedPublished: false },
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
          isExplicit: data[0]["is_explicit"],
        },
      });
    })
    .catch((err) => {
      res.status(500).json({
        success: false,
        error: `Error creating new: ${err}`,
      });
    });
});

// only returns published and non-draft tracks
const search_tracks = asyncHandler(async (req, res, next) => {
  const title = String(req.query.title);
  const artist = String(req.query.artist);

  if (!title && !artist) {
    res.status(400).json({
      success: false,
      error:
        "Must include at least one search query. Either title, artist, or album",
    });
    return;
  }

  const tracks = await prisma.trackInfo.findMany({
    where: {
      OR: [
        { title: { contains: title, mode: "insensitive" } },
        {
          artist: { contains: artist, mode: "insensitive" },
        },
      ],
      isProcessing: false,
      isDraft: false,
      publishedAt: { lte: new Date() },
    },
    take: 50,
  });

  // Add OP3 URL prefix to liveUrl
  tracks.forEach((track) => {
    track.liveUrl = addOP3URLPrefix({
      url: track.liveUrl,
      albumId: track.albumId,
    });
  });

  res.json({ success: true, data: tracks });
});

const update_track = asyncHandler(async (req, res, next) => {
  const { trackId, title, order, lyrics, isExplicit } = req.body;
  const uid = req["uid"];

  const updatedAt = new Date();

  if (!trackId) {
    res.status(400).json({
      success: false,
      error: "trackId field is required",
    });
    return;
  }

  if (!validate(trackId)) {
    res.status(400).json({
      success: false,
      error: "Invalid trackId",
    });
    return;
  }

  const intOrder = parseInt(order);
  // only validate the order if it's present
  if (!!order && (!intOrder || isNaN(intOrder))) {
    res.status(400).json({
      success: false,
      error: "order field must be an integer",
    });
    return;
  }

  // Check if user owns track
  const isOwner = await isTrackOwner(uid, trackId);

  if (!isOwner) {
    res.status(403).json({
      success: false,
      error: "User does not own this track",
    });
    return;
  }

  const unEditedTrack = await prisma.track.findFirst({
    where: { id: trackId },
  });

  // if we dont have a track match, return a 404
  if (!unEditedTrack) {
    res.status(404).json({
      success: false,
      error: `Track not found for id: ${trackId}`,
    });
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

    if (duplicateTitledTrack && duplicateTitledTrack.id !== trackId) {
      res.status(400).json({
        success: false,
        error:
          "Please pick another title, this artist already has a track with that title.",
      });
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
        ...(order ? { order: intOrder } : {}),
        lyrics,
        updatedAt,
        isExplicit,
      },
    });

    // update the album's updatedAt field
    await prisma.album.update({
      where: { id: updatedTrack.albumId },
      data: { updatedAt, isFeedPublished: false },
    });

    res.json({ success: true, data: updatedTrack });
  } catch (err) {
    log.debug(`Error editing track ${trackId}: ${err}`);
    res.status(500).json({
      success: false,
      error: "Something went wrong",
    });
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
const get_track_ranking_count = asyncHandler(async (req, res, next) => {
  const request = {
    trackId: req.params.trackId,
  };

  const ranking = await db
    .knex("ranking_forty")
    .sum("rank as count")
    .groupBy("track_id")
    .where("track_id", "=", request.trackId)
    .andWhere("rank", "=", 1)
    .catch((err) => {
      log.debug(`Error querying ranking_forty table: ${err}`);
    });

  if (!ranking) {
    res.status(500).json({
      success: false,
      error: "Something went wrong",
    });
    return;
  }

  const count = parseInt(ranking?.[0]?.count ?? 0);
  res.json({ success: true, data: count });
});

export default {
  get_featured_tracks,
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
  get_track_ranking_count,
};

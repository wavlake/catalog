import { addOP3URLPrefix } from "../library/op3";
import prisma from "../prisma/client";
import { parseLimit, shuffle } from "../library/helpers";
import db from "./db";
import log from "./logger";

/**
 * Get tracks for the shuffle playlist
 */
export const getShufflePlaylistTracks = async (limit?: number) => {
  try {
    return await getRandomTracks(limit);
  } catch (err) {
    log.error(`Error getting shuffle playlist tracks: ${err}`);
    return [];
  }
};

/**
 * Get a random selection of tracks from the database
 * @param {number} limit - Maximum number of tracks to return
 * @param {number} randomSampleSize - Size of the random sample to take (as percentage)
 * @returns {Promise<Array>} Array of track objects
 */
export const getRandomTracks = async (
  limit = 100,
  randomSampleSize = process.env.RANDOM_SAMPLE_SIZE ?? 10,
) => {
  if (isNaN(limit)) {
    throw new Error("Limit must be an integer");
  }

  const randomTracks = await db.knex
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
      "track.duration as duration",
    )
    .from(db.knex.raw(`track TABLESAMPLE BERNOULLI(${randomSampleSize})`))
    .join("amp", "amp.track_id", "=", "track.id")
    .join("artist", "track.artist_id", "=", "artist.id")
    .join("album", "album.id", "=", "track.album_id")
    .distinct()
    .where("track.deleted", "=", false)
    .andWhere("track.published_at", "<", new Date())
    .andWhere("track.is_draft", "=", false)
    .andWhere("album.published_at", "<", new Date())
    .andWhere("album.is_draft", "=", false)
    .andWhere("track.duration", "is not", null)
    .orderBy("track.id") // Add ORDER BY for consistent results
    .limit(limit)
    .catch((err) => {
      log.error(`Error querying track table for random: ${err}`);
      throw err;
    });

  // Add OP3 URL prefix to liveUrl
  randomTracks.forEach((track) => {
    track.liveUrl = addOP3URLPrefix({
      url: track.liveUrl,
      albumId: track.albumId,
    });
  });

  return shuffle(randomTracks);
};

export const getNewTracks = async (limit?: number): Promise<any[]> => {
  limit = parseLimit(limit, 50);
  const activePromos = db
    .knex("promo")
    .where("promo.is_active", "=", true)
    .andWhere("promo.is_paid", "=", true)
    .as("promos");

  const albumTracks = db.knex
    .select(
      "track.id as id",
      "track.album_id as albumId",
      "artist.id as artistId",
    )
    .join("artist", "track.artist_id", "=", "artist.id")
    .join("album", "album.id", "=", "track.album_id")
    .leftOuterJoin(activePromos, "promos.content_id", "=", "track.id")
    .rank("ranking", "track.id", "track.album_id")
    .select(
      db.knex.raw(
        `CASE WHEN promos.id IS NOT NULL then true ELSE false END as "hasPromo"`,
      ),
    )
    .min("track.title as title")
    .min("artist.name as artist")
    .min("artist.artist_url as artistUrl")
    .min("artist.artwork_url as avatarUrl")
    .min("album.artwork_url as artworkUrl")
    .select(
      db.knex.raw(
        `COALESCE((ARRAY_AGG(album.color_info) FILTER (WHERE album.color_info IS NOT NULL))[1], NULL) as "colorInfo"`,
      ),
    )
    .min("album.title as albumTitle")
    .min("track.live_url as liveUrl")
    .min("track.duration as duration")
    .min("track.created_at as createdAt")
    .andWhere("track.deleted", "=", false)
    .andWhere("artist.deleted", "=", false)
    .andWhere("album.deleted", "=", false)
    .andWhere("track.published_at", "<", new Date())
    .andWhere("track.is_draft", "=", false)
    .andWhere("album.published_at", "<", new Date())
    .andWhere("album.is_draft", "=", false)
    .andWhere("track.deleted", "=", false)
    .andWhere("track.order", "=", 1)
    .andWhere("track.duration", "is not", null)
    .from("track")
    .groupBy("track.album_id", "track.id", "artist.id", "promos.id")
    .as("a");

  const tracks = await db
    .knex(albumTracks)
    .orderBy("createdAt", "desc")
    .where("ranking", "=", 1)
    .limit(limit);

  // Add OP3 URL prefix to liveUrl
  tracks.forEach((track) => {
    track.liveUrl = addOP3URLPrefix({
      url: track.liveUrl,
      albumId: track.albumId,
    });
  });

  return tracks;
};

export const getUserRecentTracks = async (pubkey: string): Promise<any[]> => {
  const userTracks = await prisma.amp.findMany({
    where: {
      userId: pubkey,
    },
    select: {
      trackId: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    distinct: ["trackId"],
    take: 10,
  });

  const tracks = await prisma.trackInfo.findMany({
    where: {
      id: {
        in: userTracks.map((track) => track.trackId),
      },
    },
    select: {
      id: true,
      title: true,
      duration: true,
      artist: true,
      artworkUrl: true,
      artistUrl: true,
      liveUrl: true,
      albumTitle: true,
      albumId: true,
      artistId: true,
      genre: true,
      colorInfo: true,
    },
  });

  // Create a track ID map for efficient ordering later
  const trackIdToOrder = new Map(
    userTracks.map((track, index) => [track.trackId, index]),
  );
  return (
    tracks
      // Add OP3 URL prefix to artwork URLs
      .map((track) => ({
        ...track,
        liveUrl: addOP3URLPrefix({
          url: track.liveUrl,
          albumId: track.albumId,
        }),
      }))
      // order by amp createdAt desc
      .sort(
        (a, b) =>
          (trackIdToOrder.get(a.id) ?? 0) - (trackIdToOrder.get(b.id) ?? 0),
      )
      // filter out tracks that aren't defined
      .filter((track) => Boolean(track))
  );
};

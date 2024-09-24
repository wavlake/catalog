import { addOP3URLPrefix } from "../library/op3";
import prisma from "../prisma/client";
import { parseLimit } from "../library/helpers";
import db from "./db";

export const getNewTracks = async (limit?: number): Promise<any[]> => {
  limit = parseLimit(limit, 50);
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
    },
    orderBy: {
      order: "asc",
    },
  });

  // Add OP3 URL prefix to artwork URLs
  tracks.forEach((track) => {
    track.liveUrl = addOP3URLPrefix({
      url: track.liveUrl,
      albumId: track.albumId,
    });
  });

  return tracks;
};

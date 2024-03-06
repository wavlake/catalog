import prisma from "../prisma/client";
const asyncHandler = require("express-async-handler");
import { formatError } from "../library/errors";
import { validate } from "uuid";
import log from "loglevel";

const get_all_by_term = asyncHandler(async (req, res, next) => {
  const term = String(req.query.term);

  if (!term) {
    const error = formatError(400, "term field is required");
    next(error);
    return;
  }

  const isUuid = validate(term);

  if (isUuid) {
    log.debug("Searching for track by id: ", term);
    const track = await prisma.trackInfo.findFirst({
      where: {
        id: term,
        isDraft: false,
        publishedAt: { lte: new Date() },
      },
    });
    log.debug("Found track", track);

    if (track) {
      res.json({ success: true, data: [track] });
      return;
    }
  }

  // TODO: Sort results by sats?
  const artists = await prisma.artist.findMany({
    where: {
      name: { contains: term, mode: "insensitive" },
      deleted: false,
      album: {
        some: {
          deleted: false,
          isDraft: false,
          publishedAt: { lte: new Date() },
        },
      },
      track: {
        some: {
          deleted: false,
          isDraft: false,
          publishedAt: { lte: new Date() },
        },
      },
    },
    take: 10,
  });

  const albums = await prisma.album.findMany({
    where: {
      title: { contains: term, mode: "insensitive" },
      deleted: false,
      isDraft: false,
      publishedAt: { lte: new Date() },
      track: {
        some: {
          deleted: false,
          isDraft: false,
          publishedAt: { lte: new Date() },
        },
      }, // some: at least one
    },
    include: {
      artist: true,
    },
    take: 10,
  });

  const tracks = await prisma.trackInfo.findMany({
    where: {
      title: { contains: term, mode: "insensitive" },
      duration: { not: null },
      isDraft: false,
      publishedAt: { lte: new Date() },
    },
    orderBy: {
      msatTotal: "desc",
    },
    take: 10,
  });

  const results = combineResults(artists, albums, tracks);

  res.json({ success: true, data: results });
});

function combineResults(artists, albums, tracks) {
  const results = [];
  artists.forEach((artist) => {
    results.push({
      id: artist.id,
      type: "artist",
      name: artist.name,
      url: artist.artistUrl,
      avatarUrl: artist.artworkUrl,
    });
  });
  albums.forEach((album) => {
    results.push({
      id: album.id,
      type: "album",
      name: album.title,
      url: album.url,
      artworkUrl: album.artworkUrl,
      avatarUrl: album.artist.artworkUrl,
    });
  });
  tracks.forEach((track) => {
    results.push({
      id: track.id,
      type: "track",
      name: track.title,
      url: track.url,
      artworkUrl: track.artworkUrl,
      liveUrl: track.liveUrl,
      duration: track.duration,
      albumId: track.albumId,
      albumTitle: track.albumTitle,
      artistId: track.artistId,
      artist: track.artist,
      avatarUrl: track.avatarUrl,
    });
  });
  return results;
}

export default {
  get_all_by_term,
};

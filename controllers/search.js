import prisma from "../prisma/client";
const asyncHandler = require("express-async-handler");
import { formatError } from "../library/errors";

const get_all_by_term = asyncHandler(async (req, res, next) => {
  const term = String(req.query.term);

  if (!term) {
    const error = formatError(400, "term field is required");
    next(error);
  }

  // TODO: Sort results by sats?
  const artists = await prisma.artist.findMany({
    where: { name: { contains: term, mode: "insensitive" }, deleted: false },
    take: 10,
  });

  // TODO: Filter out albums with no tracks
  const albums = await prisma.album.findMany({
    where: { title: { contains: term, mode: "insensitive" }, deleted: false },
    take: 10,
  });

  const tracks = await prisma.trackInfo.findMany({
    where: { title: { contains: term, mode: "insensitive" } },
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
      artworkUrl: artist.artworkUrl,
    });
  });
  albums.forEach((album) => {
    results.push({
      id: album.id,
      type: "album",
      name: album.title,
      url: album.url,
      artworkUrl: album.artworkUrl,
    });
  });
  tracks.forEach((track) => {
    results.push({
      id: track.id,
      type: "track",
      name: track.title,
      url: track.url,
      artworkUrl: track.artworkUrl,
    });
  });
  return results;
}

export default {
  get_all_by_term,
};

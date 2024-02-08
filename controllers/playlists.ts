import { validate } from "uuid";
import { formatError } from "../library/errors";
import prisma from "../prisma/client";

const get_playlists = async (req, res, next) => {
  const { id } = req.params;

  if (!id) {
    next(formatError(400, "Missing playlist ID"));
    return;
  }

  if (validate(id) === false) {
    next(formatError(400, "Invalid playlist ID"));
    return;
  }

  const playlistTracks = await prisma.playlistTrack.findMany({
    where: { playlistId: id },
    select: {
      trackId: true,
      order: true,
    },
    orderBy: { order: "asc" },
  });

  if (!playlistTracks) {
    next(formatError(404, "Playlist ID not found"));
    return;
  }

  const trackInfo = await prisma.trackInfo.findMany({
    where: {
      id: {
        in: playlistTracks.map((track) => track.trackId),
      },
    },
    select: {
      id: true,
      title: true,
      duration: true,
      artist: true,
      artworkUrl: true,
      artistUrl: true,
    },
  });

  res.json({ success: true, data: trackInfo });
};

export default {
  get_playlists,
};

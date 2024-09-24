import { addOP3URLPrefix } from "../library/op3";
import prisma from "../prisma/client";

export const getPlaylistTracks = async (playlistId: string): Promise<any[]> => {
  const tracks = await prisma.playlistTrack.findMany({
    where: {
      playlistId,
    },
    include: {
      trackInfo: {
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
      },
    },
    orderBy: {
      order: "asc",
    },
  });

  // Add OP3 URL prefix to artwork URLs
  tracks.forEach((track) => {
    track.trackInfo.liveUrl = addOP3URLPrefix({
      url: track.trackInfo.liveUrl,
      albumId: track.trackInfo.albumId,
    });
  });

  // Destructure the trackInfo object with orderInt
  return tracks.map(({ trackInfo, orderInt }) => ({
    ...trackInfo,
    order: orderInt,
  }));
};

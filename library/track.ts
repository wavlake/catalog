import { addOP3URLPrefix } from "../library/op3";
import prisma from "../prisma/client";

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

  // Destructure the trackInfo object with orderInt
  return tracks;
};

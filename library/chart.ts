import { addOP3URLPrefix } from "./op3";
import prisma from "../prisma/client";

export const getWeeklyTop40 = async () => {
  const tracks = await prisma.trackInfo.findMany({
    where: {
      isDraft: false,
      publishedAt: { lte: new Date() },
      msatTotal7Days: { gt: 0 },
    },
    orderBy: { msatTotal7Days: "desc" },
    take: 40,
  });

  // Add OP3 URL prefix to liveUrl
  const tracksWithOp3 = tracks.map((track) => {
    return {
      ...track,
      liveUrl: addOP3URLPrefix({
        url: track.liveUrl,
        albumId: track.albumId,
      }),
    };
  });

  return tracksWithOp3;
};

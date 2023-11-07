import prisma from "../prisma/client";

export const getAllComments = async (contentIds: string[], limit?: number) => {
  const [userComments, nostrComments] = await Promise.all([
    prisma.comment.findMany({
      where: {
        AND: [
          {
            OR: contentIds.map((id) => ({
              contentId: id,
            })),
          },
          { isNostr: false },
        ],
      },
      take: limit,
    }),
    prisma.comment.findMany({
      where: {
        AND: [
          {
            OR: contentIds.map((id) => ({
              contentId: id,
            })),
          },
          { isNostr: true },
        ],
      },
      take: limit,
    }),
  ]);

  const commentsWithUserInfo = await Promise.all(
    userComments.map(async (comment) => {
      if (comment.userId === "keysend") {
        return comment;
      }

      const user = await prisma.user.findUnique({
        where: { id: comment.userId },
      });

      return {
        ...comment,
        name: user.name,
        commenterProfileUrl: user.profileUrl,
        commenterArtworkUrl: user.artworkUrl,
      };
    })
  );

  const sortedComments = [...commentsWithUserInfo, ...nostrComments].sort(
    (a, b) => (a.createdAt < b.createdAt ? 1 : -1)
  );

  const commentsWithSatAmount = await Promise.all(
    sortedComments.map(async (comment) => {
      if (comment.txId) {
        const preamp = await prisma.preamp.findUnique({
          where: { txId: comment.txId },
        });

        return {
          ...comment,
          commentMsatSum: preamp.msatAmount,
        };
      } else {
        return {
          ...comment,
        };
      }
    })
  );

  return commentsWithSatAmount;
};

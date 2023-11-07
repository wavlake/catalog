import prisma from "../prisma/client";
import db from "../library/db";

export const getAllComments = async (contentIds: string[], limit: number) => {
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

  const commentsLegacy = await db
    .knex("comment")
    .leftOuterJoin("user", "comment.user_id", "=", "user.id")
    .join("amp", "comment.amp_id", "=", "amp.id")
    .join("track", "track.id", "=", "amp.track_id")
    .join("artist", "artist.id", "=", "track.artist_id")
    .select(
      "comment.id as id",
      "track.id as trackId",
      "is_nostr as isNostr",
      "amp.tx_id as txId"
    )
    .min("track.title as title")
    .min("artist.user_id as ownerId")
    .min("comment.content as content")
    .min("comment.created_at as createdAt")
    .min("amp.msat_amount as commentMsatSum")
    .min("comment.user_id as userId")
    .min("user.name as name")
    .min("user.profile_url as commenterProfileUrl")
    .min("user.artwork_url as commenterArtworkUrl")
    .whereIn("track.id", contentIds)
    .andWhere("amp.comment", "=", true)
    .andWhere("track.deleted", "=", false)
    .whereNull("comment.parent_id")
    .groupBy("comment.id", "track.id", "amp.tx_id")
    .orderBy("createdAt", "desc")
    .limit(limit);

  // TODO: Make more efficient
  // These three queries are all run separately and then combined
  const sortedComments = [
    ...commentsWithUserInfo,
    ...nostrComments,
    ...commentsLegacy,
  ]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);

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

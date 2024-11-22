import db from "../library/db";

const currentMonth = () => {
  const now = new Date();
  // get last 30 days
  return new Date(now.setDate(now.getDate() - 30));
};

const priorMonth = () => {
  const now = new Date();
  return new Date(now.setDate(now.getDate() - 60));
};

export const getEarningsNumbers = async (userId: string) => {
  // get earnings and unique supporters for current month
  const last30DayEarnings = await db
    .knex("amp")
    .countDistinct("user_id as supporters")
    .sum("msat_amount as msatTotal")
    .where("split_destination", "=", userId)
    .andWhere("created_at", ">", currentMonth())
    .groupBy("split_destination")
    .first();

  // get earnings and unique supporters for previous calendar month
  const previousMonthEarnings = await db
    .knex("amp")
    .countDistinct("user_id as supporters")
    .sum("msat_amount as msatTotal")
    .where("split_destination", "=", userId)
    .andWhere("created_at", ">", priorMonth())
    .andWhere("created_at", "<", currentMonth())
    .groupBy("split_destination")
    .first();

  const msatEarnings30Days =
    Math.floor(parseInt(last30DayEarnings?.msatTotal) / 1000) * 1000 || 0;
  const msatEarningsPreviousMonth =
    Math.floor(parseInt(previousMonthEarnings?.msatTotal) / 1000) * 1000 || 0;
  const msatEarningsRateOfChange = Math.floor(
    (msatEarnings30Days / msatEarningsPreviousMonth - 1) * 100
  );

  const supporters30Days = parseInt(last30DayEarnings?.supporters) || 0;
  const supportersPreviousMonth =
    parseInt(previousMonthEarnings?.supporters) || 0;
  const supportersRateOfChange = Math.floor(
    (supporters30Days / supportersPreviousMonth - 1) * 100
  );

  return {
    msatEarnings30Days,
    msatEarningsPreviousMonth,
    msatEarningsRateOfChange,
    supporters30Days,
    supportersPreviousMonth,
    supportersRateOfChange,
  };
};

export const getTopSupporters = async (userId: string) => {
  const topSupporters = await db
    .knex("amp")
    .leftOuterJoin("user", "amp.user_id", "user.id")
    .select("user_id as userId", "user.name", "user.artwork_url as artworkUrl")
    .sum("msat_amount as msatTotal")
    .where("split_destination", "=", userId)
    .whereNotIn("user_id", ["keysend", "invoice"])
    .andWhere("amp.created_at", ">", priorMonth())
    .andWhere("amp.created_at", "<", currentMonth())
    .groupBy("user_id", "user.name", "user.artwork_url")
    .orderBy("msatTotal", "desc")
    .limit(5);

  return topSupporters;
};

export const getTopContent = async (userId: string) => {
  const topContent = await db
    .knex("amp")
    .leftOuterJoin("track", "amp.track_id", "track.id")
    .leftOuterJoin("episode", "amp.track_id", "episode.id")
    .leftOuterJoin("album", "track.album_id", "album.id")
    .leftOuterJoin("podcast", "episode.podcast_id", "podcast.id")
    .select(
      "track_id as id",
      "track.album_id as albumId",
      "episode.podcast_id as podcastId",
      db.knex.raw("COALESCE(track.title, episode.title) as title"),
      db.knex.raw(
        `COALESCE(album.artwork_url, podcast.artwork_url) as "artworkUrl"`
      )
    )
    .sum("msat_amount as msatTotal")
    .where("split_destination", "=", userId)
    .andWhere("amp.created_at", ">", priorMonth())
    .andWhere("amp.created_at", "<", currentMonth())
    .groupBy(
      "amp.track_id",
      "track.title",
      "episode.title",
      "track.album_id",
      "episode.podcast_id",
      "album.artwork_url",
      "podcast.artwork_url"
    )
    .orderBy("msatTotal", "desc")
    .limit(5);

  return topContent;
};

export const getLifetimeEarnings = async (userId: string) => {
  const lifetimeEarnings = await db
    .knex("amp")
    .sum("msat_amount as msatTotal")
    .where("split_destination", "=", userId)
    .groupBy("split_destination")
    .first();

  return Math.floor(parseInt(lifetimeEarnings?.msatTotal) / 1000) * 1000 || 0;
};

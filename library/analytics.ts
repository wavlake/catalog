import db from "../library/db";
import { getType } from "./content";
import { getOwnerId } from "./split";

const currentMonth = () => {
  const now = new Date();
  // get last 30 days
  return new Date(now.setDate(now.getDate() - 30));
};

const priorMonth = () => {
  const now = new Date();
  return new Date(now.setDate(now.getDate() - 60));
};

interface TrackEarnings {
  total: string | null;
}

interface UniqueUserCount {
  unique_user_count: string | number;
}

export const getContentMonthlyEarnings = async (
  userId: string,
  contentId: string
) => {
  const contentType = await getType(contentId);
  if (contentType != "album" && contentType != "podcast") {
    throw new Error("Invalid content type");
  }
  const isOwner = (await getOwnerId(contentId, contentType)) === userId;
  if (!isOwner) {
    throw new Error("User is not the owner of this content");
  }

  const table = contentType === "album" ? "track" : "episode";

  // Get all content IDs in a single query
  const contentIds = await db
    .knex(table)
    .select("id")
    .where(`${contentType}_id`, "=", contentId);

  const contentIdList = contentIds.map((c) => c.id);

  const [trackEarnings, uniqueUserCount] = await Promise.all([
    db
      .knex("amp")
      .sum("msat_amount as total")
      .whereIn("track_id", contentIdList)
      .andWhere("created_at", ">=", currentMonth())
      .first(),
    db
      .knex("preamp")
      .select(
        db.knex.raw(`
      COUNT(DISTINCT 
        CASE 
          WHEN user_id = 'keysend' THEN sender_name 
          ELSE user_id 
        END
      ) as unique_user_count
    `)
      )
      .whereIn("content_id", contentIdList)
      .andWhere("created_at", ">=", currentMonth())
      .first(),
  ]);
  return {
    earnings: parseInt((trackEarnings as TrackEarnings)?.total || "0"),
    uniqueAmpUsers: parseInt(
      String((uniqueUserCount as UniqueUserCount)?.unique_user_count) || "0"
    ),
  };
};

export const getEarningsNumbers = async (userId: string) => {
  // get earnings and unique supporters for current month
  const last30DayEarnings = await db
    .knex("amp")
    .countDistinct("user_id as supporters")
    .sum("msat_amount as msatTotal")
    .where("split_destination", "=", userId)
    .andWhere("created_at", ">=", currentMonth())
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
    .leftOuterJoin("preamp", "amp.tx_id", "preamp.tx_id")
    .select(
      "amp.user_id as userId",
      "user.name as name",
      "preamp.sender_name as senderName",
      "preamp.app_name as appName",
      "user.artwork_url as artworkUrl"
    )
    .sum("amp.msat_amount as msatTotal")
    .where("split_destination", "=", userId)
    .andWhere("amp.created_at", ">=", currentMonth())
    .groupBy(
      "amp.user_id",
      "user.name",
      "user.artwork_url",
      "preamp.sender_name",
      "preamp.app_name"
    )
    .orderBy("msatTotal", "desc");

  // Clean up anon supporters
  let anonSupporters = 0;
  let anonMsats = 0;
  const countAndRemoveAnon = topSupporters.map((supporter) => {
    if (!supporter.name && !supporter.senderName) {
      anonSupporters += 1;
      anonMsats += parseInt(supporter.msatTotal);
      return null;
    }
    return supporter;
  });

  // filter nulls
  const filteredSupporters = countAndRemoveAnon.filter(
    (supporter) => supporter !== null
  );

  // Use senderName and appName for name if name is missing
  filteredSupporters.forEach((supporter) => {
    if (supporter.senderName) {
      supporter.name = `${supporter.senderName} (via ${
        supporter.appName ?? "unknown"
      })`;
    }
  });

  if (anonSupporters > 0) {
    filteredSupporters.push({
      userId: "",
      name: `anonymous (${anonSupporters})`,
      artworkUrl: null,
      msatTotal: anonMsats.toString(),
    });
  }

  // sort by filtered supporters by msatTotal
  filteredSupporters.sort(
    (a, b) => parseInt(b.msatTotal) - parseInt(a.msatTotal)
  );

  return filteredSupporters;
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
    .andWhere("amp.created_at", ">=", currentMonth())
    .groupBy(
      "amp.track_id",
      "track.title",
      "episode.title",
      "track.album_id",
      "episode.podcast_id",
      "album.artwork_url",
      "podcast.artwork_url"
    )
    .orderBy("msatTotal", "desc");

  // Filter out content with no title (removes artist only boosts)
  return topContent.filter((content) => content.title);
};

export const getLifetimeEarnings = async (userId: string) => {
  const lifetimeEarnings = await db
    .knex("amp")
    .sum("msat_amount as msatTotal")
    .where("split_destination", "=", userId)
    .groupBy("split_destination")
    .first();

  const legacyEarnings = await db
    .knex("amp")
    .sum("msat_amount as msatTotal")
    .where("user_id", "=", userId)
    .whereNull("split_destination")
    .groupBy("user_id")
    .first();

  return (
    Math.floor(
      (parseInt(lifetimeEarnings?.msatTotal) +
        parseInt(legacyEarnings?.msatTotal)) /
        1000
    ) * 1000 || 0
  );
};

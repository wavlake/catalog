import prisma from "../prisma/client";
import asyncHandler from "express-async-handler";
import { Prisma } from "@prisma/client";
import db from "../library/db";
import { SplitContentTypes } from "../library/userHelper";
import log from "../library/logger";
import { nip19 } from "nostr-tools";

type ActivityType =
  | "playlistCreate"
  | "zap"
  | "updatePlaylist"
  | "trackPublish"
  | "trending"
  | "hot";

interface ActivityItem {
  picture: string;
  name: string;
  userId: string;
  type: ActivityType;
  message?: string;
  zapAmount?: number;
  timestamp: string;
  contentId: string;
  contentTitle: string;
  contentType: SplitContentTypes | "playlist";
  contentArtwork: string[];
  parentContentId?: string;
  parentContentTitle?: string;
  parentContentType?: string;
  artist?: string;
}

interface Follow extends Prisma.JsonArray {
  pubkey: string;
  relay?: string;
  petname?: string;
}

const LOOKBACK_DAYS = 45;
////// QUERIES //////
const runQueries = async (pubkeys: any[] | null) => {
  const newDate = new Date();
  newDate.setDate(newDate.getDate() - LOOKBACK_DAYS);
  const filterDate = newDate.toISOString().slice(0, 19).replace("T", " ");

  // Query to get just the first 4 tracks in a playlist
  const PLAYLIST_TRACKS_METADATA = db
    .knex("playlist_track")
    .select("playlist_id", "track_id")
    .rowNumber("row_number", function () {
      this.orderBy("order_int").partitionBy("playlist_id");
    })
    .as("playlist_four");

  const PLAYLIST_TRACKS_COUNT = db
    .knex("playlist_track")
    .select("playlist_id")
    .count("playlist_id as count")
    .groupBy("playlist_id")
    .as("playlist_track_count");

  const PLAYLIST_QUERY = db
    .knex("playlist")
    .leftOuterJoin("npub", "playlist.user_id", "npub.public_hex")
    .join(
      PLAYLIST_TRACKS_METADATA,
      "playlist.id",
      "=",
      "playlist_four.playlist_id"
    )
    .join(
      PLAYLIST_TRACKS_COUNT,
      "playlist.id",
      "=",
      "playlist_track_count.playlist_id"
    )
    .join("track_info", "track_info.id", "=", "playlist_four.track_id")
    .select(
      "playlist.id as content_id",
      db.knex.raw("MIN(playlist.title) as content_title"),
      db.knex.raw("ARRAY_AGG(track_info.artwork_url) as content_artwork_list"),
      db.knex.raw("npub.metadata::jsonb -> 'picture' as picture"),
      db.knex.raw("npub.metadata::jsonb -> 'name' as name"),
      db.knex.raw("'playlistCreate' as type"),
      db.knex.raw("'playlist' as content_type"),
      db.knex.raw("MIN(playlist.user_id) as user_id"),
      db.knex.raw("MIN(playlist.title) as title"),
      db.knex.raw("MIN(playlist.updated_at) as timestamp"),
      db.knex.raw("MIN(playlist_track_count.count) as track_count")
    )
    .orderBy("playlist.updated_at", "desc")
    .groupBy("playlist.id", "npub.metadata")
    .where("playlist.updated_at", ">", filterDate)
    .andWhere("playlist_four.row_number", "<=", 4)
    .whereRaw("LENGTH(playlist.user_id) = 64")
    .as("playlist_query");

  const NEW_TRACKS_QUERY = db
    .knex("track_info")
    .join("user", "track_info.user_id", "user.id")
    .select(
      "track_info.artist as name",
      // TODO: No way to join decoded npub in artist table to npub table in db
      db.knex.raw(
        'COALESCE("user"."artwork_url", "track_info"."avatar_url") as picture'
      ),
      "track_info.artist_npub as user_id",
      "track_info.id as content_id",
      "track_info.title as content_title",
      "track_info.artwork_url as content_artwork",
      db.knex.raw("'track' as content_type"),
      "track_info.album_id as parent_content_id",
      "track_info.album_title as parent_content_title",
      "track_info.artist as artist",
      db.knex.raw("'album' as parent_content_type"),
      db.knex.raw("'trackPublish' as type"),
      "track_info.published_at as timestamp",
      db.knex.raw("0 as msat_amount"),
      db.knex.raw("null as content")
    )
    .orderBy("published_at", "desc")
    .where("published_at", ">", filterDate)
    .whereRaw("LENGTH(track_info.artist_npub) = 63")
    .as("new_tracks_query");

  const ZAP_TYPES = [7, 10];
  // TODO: Add zaps for Albums, Episodes, Podcasts
  const ZAP_QUERY = db
    .knex("amp")
    .leftOuterJoin("comment", "comment.tx_id", "=", "amp.tx_id")
    .select(
      "amp.user_id as user_id",
      "amp.track_id as content_id",
      db.knex.raw("date_part('hour', amp.created_at) as hour"),
      db.knex.raw("'zap' as type")
    )
    .sum("amp.msat_amount as msat_amount")
    .min("amp.created_at as timestamp")
    .min("amp.content_type as content_type")
    .min("comment.content as content")
    // to dedupe zaps for the same user, track, and hour
    .groupBy(
      "amp.user_id",
      "amp.track_id",
      db.knex.raw("date_part('hour', amp.created_at)")
    )
    .orderBy("timestamp", "desc")
    .where("amp.created_at", ">", filterDate)
    .whereIn("amp.type", ZAP_TYPES)
    .whereIn("amp.content_type", ["track", "artist"])
    .as("zap_query");

  const ZAP_WITH_METADATA = db
    .knex(ZAP_QUERY)
    .leftOuterJoin("npub", "zap_query.user_id", "=", "npub.public_hex")
    .leftOuterJoin("track", "track.id", "=", "zap_query.content_id")
    .leftOuterJoin("track_info", "track_info.id", "=", "zap_query.content_id")
    .leftOuterJoin("album", "album.id", "=", "track.album_id")
    .leftOuterJoin("artist", "artist.id", "=", "zap_query.content_id")
    .select(
      db.knex.raw("npub.metadata::jsonb -> 'name' as name"),
      db.knex.raw("npub.metadata::jsonb -> 'picture' as picture"),
      db.knex.raw("null as name"),
      db.knex.raw("null as picture"),
      "zap_query.user_id as user_id",
      "zap_query.content_id as content_id",
      db.knex.raw("COALESCE(track.title, artist.name) as content_title"),
      "zap_query.content_type as content_type",
      db.knex.raw(
        "COALESCE(album.artwork_url, artist.artwork_url) as content_artwork"
      ),
      db.knex.raw("COALESCE(album.id) as parent_content_id"),
      db.knex.raw("COALESCE(album.title) as parent_content_title"),
      db.knex.raw("COALESCE(track_info.artist) as artist"),
      db.knex.raw("'placeholder' as parent_content_type"),
      "zap_query.type as type",
      "zap_query.timestamp as timestamp",
      "zap_query.msat_amount as msat_amount",
      "zap_query.content as content"
    )
    .as("zap_with_metadata");

  // const UNION_QUERY = db
  //   .knex(NEW_TRACKS_QUERY)
  //   .unionAll([db.knex(ZAP_WITH_METADATA)])
  //   .as("union_query");

  const npubs = pubkeys ? await getNpubs(pubkeys) : null;
  const playlists = pubkeys
    ? await db.knex(PLAYLIST_QUERY).whereIn("user_id", pubkeys)
    : await db.knex(PLAYLIST_QUERY);
  const tracks = pubkeys
    ? await db.knex(NEW_TRACKS_QUERY).whereIn("user_id", npubs)
    : await db.knex(NEW_TRACKS_QUERY);
  const zaps = pubkeys
    ? await db.knex(ZAP_WITH_METADATA).whereIn("user_id", pubkeys)
    : await db.knex(ZAP_WITH_METADATA);

  return [...playlists, ...tracks, ...zaps];
};

////// FUNCTIONS //////

const getNpubs = async (hexList: string[]) => {
  const npubs: string[] = [];

  for (const hex of hexList) {
    try {
      // Validate hex string format
      if (!hex || typeof hex !== "string") {
        log.warn(`Invalid hex value: ${hex}`);
        continue;
      }

      // Check if it's a valid hex string (only contains 0-9, a-f, A-F)
      if (!/^[0-9a-fA-F]+$/.test(hex)) {
        log.warn(`Invalid hex format: ${hex}`);
        continue;
      }

      // Check if it's the correct length (64 characters for a pubkey)
      if (hex.length !== 64) {
        log.warn(
          `Invalid hex length: ${hex} (length: ${hex.length}, expected: 64)`
        );
        continue;
      }

      const npub = nip19.npubEncode(hex);
      npubs.push(npub);
    } catch (error) {
      log.error(`Failed to encode hex to npub: ${hex}`, error);
      // Continue processing other hex values instead of failing completely
    }
  }

  return npubs;
};

const formatActivityItems = (activities: any[]) => {
  const formattedActivities = activities.map((activity: any) => {
    const contentArtwork = activity.content_artwork
      ? [activity.content_artwork]
      : activity.content_artwork_list;
    let userId: string;
    if (activity.type === "trackPublish") {
      try {
        userId = nip19.decode(activity.user_id).data as string;
      } catch (e) {
        userId = activity.user_id;
      }
    } else {
      userId = activity.user_id;
    }
    return {
      picture: activity.picture,
      name: activity.name,
      userId: userId,
      type: activity.type,
      message: activity.content,
      zapAmount: activity.msat_amount,
      timestamp: activity.timestamp,
      contentId: activity.content_id,
      contentTitle: activity.content_title,
      contentType: activity.content_type,
      contentArtwork: contentArtwork,
      parentContentId: activity.parent_content_id,
      parentContentTitle: activity.track_count
        ? `${activity.track_count} track${activity.track_count > 1 ? "s" : ""}`
        : activity.parent_content_title,
      artist: activity.artist,
      parentContentType: activity.parent_content_type,
    } as ActivityItem;
  });
  return formattedActivities;
};

const getActivity = async (
  pubkeys: string[] | null,
  limit: number,
  offset: number = 0
) => {
  const activities: any[] = await runQueries(pubkeys);

  const formattedActivity = formatActivityItems(activities);

  // sort the activity by timestamp
  const sortedActivity = formattedActivity.sort((a, b) => {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
  // apply the limit and offset
  const pageStart = (offset - 1) * limit;
  const pageEnd = pageStart + limit;
  const paginatedActivity = sortedActivity.slice(pageStart, pageEnd);
  return paginatedActivity;
};

////// CONTROLLERS //////

const get_activity_feed = asyncHandler(async (req, res, next) => {
  const { page = "1", pageSize = "10", pubkey } = req.params;
  if (!pubkey) {
    res.status(400).json({ success: false, error: "Must provde a pubkey" });
    return;
  }

  const pubkeyFollows = await prisma.npub
    .findFirstOrThrow({
      where: {
        publicHex: pubkey,
      },
    })
    .catch((err) => {
      log.info("Pubkey not found in npub table: ", err);
      return { follows: [] };
    });

  const pubkeyList = (pubkeyFollows.follows as Follow[]).map(
    (follow) => follow.pubkey
  );

  const activityItems = await getActivity(
    pubkeyList,
    parseInt(pageSize),
    parseInt(page)
  );

  res.send({
    success: true,
    data: activityItems,
  });
});

const get_account_activity = asyncHandler(async (req, res, next) => {
  const { page = "1", pageSize = "10", pubkey } = req.params;
  if (!pubkey) {
    res.status(400).json({ success: false, error: "Must provde a pubkey" });
    return;
  }

  const activityItems = await getActivity(
    [pubkey],
    parseInt(pageSize),
    parseInt(page)
  );
  res.send({
    success: true,
    data: activityItems,
  });
});

const get_global_feed = asyncHandler(async (req, res, next) => {
  const { page = "1", pageSize = "10" } = req.params;

  const activityItems = await getActivity(
    null,
    parseInt(pageSize),
    parseInt(page)
  );

  res.send({
    success: true,
    data: activityItems,
  });
});

export default {
  get_activity_feed,
  get_global_feed,
  get_account_activity,
};

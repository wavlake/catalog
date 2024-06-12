import prisma from "../prisma/client";
import asyncHandler from "express-async-handler";
import { Prisma } from "@prisma/client";
import db from "../library/db";
import { SplitContentTypes } from "../library/userHelper";
import log from "loglevel";
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
      "track_info.id as content_id",
      "track_info.title as content_title",
      "track_info.artwork_url as content_artwork",
      "track_info.album_id as parent_content_id",
      "track_info.album_title as parent_content_title",
      "track_info.published_at as timestamp",
      "track_info.artist_npub as npub",
      "track_info.artist as name",
      // TODO: No way to join decoded npub in artist table to npub table in db
      db.knex.raw(
        'COALESCE("user"."artwork_url", "track_info"."avatar_url") as picture'
      ),
      db.knex.raw("'trackPublish' as type"),
      db.knex.raw("'track' as content_type"),
      db.knex.raw("'album' as parent_content_type")
    )
    .orderBy("published_at", "desc")
    .where("published_at", ">", filterDate)
    .whereRaw("LENGTH(track_info.artist_npub) = 64")
    .as("new_tracks_query");

  const ZAP_TYPE = 7;
  // TODO: Add zaps for Albums, Episodes, Podcasts
  const ZAP_QUERY = db
    .knex("amp")
    .leftOuterJoin("track", "track.id", "=", "amp.track_id")
    .leftOuterJoin("album", "album.id", "=", "track.album_id")
    .leftOuterJoin("artist", "artist.id", "=", "amp.track_id")
    .leftOuterJoin("npub", "amp.user_id", "=", "npub.public_hex")
    .leftOuterJoin("comment", "comment.tx_id", "=", "amp.tx_id")
    .select(
      db.knex.raw("npub.metadata::jsonb -> 'picture' as picture"),
      db.knex.raw("npub.metadata::jsonb -> 'name' as name"),
      db.knex.raw('COALESCE("amp"."track_id") as content_id'),
      db.knex.raw(
        'COALESCE("track"."title", "artist"."name") as content_title'
      ),
      db.knex.raw('COALESCE("album"."id") as parent_content_id'),
      db.knex.raw('COALESCE("album"."title") as parent_content_title'),
      db.knex.raw("'zap' as type"),
      "album.artwork_url as content_artwork",
      "amp.msat_amount as msat_amount",
      "amp.created_at as timestamp",
      "amp.content_type as content_type",
      "npub.metadata as metadata",
      "comment.content as content",
      "amp.user_id as user_id"
    )
    .orderBy("amp.created_at", "desc")
    .where("amp.created_at", ">", filterDate)
    .andWhere("amp.type", ZAP_TYPE)
    .as("zap_query");

  const npubs = pubkeys ? await getNpubs(pubkeys) : null;
  const playlists = pubkeys
    ? await db.knex(PLAYLIST_QUERY).whereIn("user_id", pubkeys)
    : await db.knex(PLAYLIST_QUERY);
  const tracks = pubkeys
    ? await db.knex(NEW_TRACKS_QUERY).whereIn("npub", npubs)
    : await db.knex(NEW_TRACKS_QUERY);
  const zaps = pubkeys
    ? await db.knex(ZAP_QUERY).whereIn("user_id", pubkeys)
    : await db.knex(ZAP_QUERY);
  return [...playlists, ...tracks, ...zaps];
};

////// FUNCTIONS //////

const getNpubs = async (hexList: string[]) => {
  let npubs: string[] = [];
  hexList.forEach(async (hex) => {
    npubs.push(nip19.npubEncode(hex));
  });
  return npubs;
};

const formatActivityItems = async (activities: any) => {
  const formattedActivities = await Promise.all(
    activities.map(async (activity: any) => {
      const contentArtwork = activity.content_artwork
        ? [activity.content_artwork]
        : activity.content_artwork_list;
      return {
        picture: activity.picture,
        name: activity.name,
        userId: activity.npub
          ? nip19.decode(activity.npub).data
          : activity.user_id,
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
          ? `${activity.track_count} track${
              activity.track_count > 1 ? "s" : ""
            }`
          : activity.parent_content_title,
        parentContentType: activity.parent_content_type,
      } as ActivityItem;
    })
  );
  return formattedActivities;
};

const getActivity = async (
  pubkeys: string[] | null,
  limit: number,
  offset: number = 0
) => {
  const activities: any[] = await runQueries(pubkeys);

  const formattedActivity = await formatActivityItems(activities);

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
      log.debug("Pubkey not found in npub table: ", err);
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

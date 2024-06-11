import prisma from "../prisma/client";
import asyncHandler from "express-async-handler";
import { Prisma } from "@prisma/client";
import db from "../library/db";
import { SplitContentTypes } from "../library/userHelper";
import log from "loglevel";
import {
  getContentFromId,
  getParentContentTypeAndId,
} from "../library/content";
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

////// QUERIES //////

const LOOKBACK_DAYS = 45;
const NEW_DATE = new Date();
NEW_DATE.setDate(NEW_DATE.getDate() - LOOKBACK_DAYS);
const FILTER_DATE = NEW_DATE.toISOString().slice(0, 19).replace("T", " ");

const PLAYLIST_QUERY = db
  .knex("playlist")
  .join("npub", "playlist.user_id", "npub.public_hex")
  .select(
    "playlist.id as id",
    "playlist.user_id as user_id",
    "playlist.title as title",
    "playlist.updated_at as updated_at",
    "npub.metadata as metadata"
  )
  .orderBy("playlist.updated_at", "desc")
  .where("playlist.updated_at", ">", FILTER_DATE);

const NEW_TRACKS_QUERY = db
  .knex("track_info")
  .select(
    "track_info.id as contentId",
    "track_info.title as contentTitle",
    "track_info.artwork_url as contentArtwork",
    "track_info.album_id as parentContentId",
    "track_info.album_title as parentContentTitle",
    "track_info.published_at as created_at",
    "track_info.artist_npub as artist_npub"
  )
  .orderBy("published_at", "desc")
  .where("published_at", ">", FILTER_DATE);

const ZAP_TYPE = 7;
const ZAP_QUERY = db
  .knex("amp")
  .andWhere("amp.type", ZAP_TYPE)
  .join("npub", "amp.user_id", "=", "npub.public_hex")
  // for zaps, the type_key is the content_id
  // zap comments have comment.amp_id hardcoded to 0
  .leftJoin("comment", "comment.id", "=", "amp.type_key")
  .select(
    "amp.track_id as content_id",
    "amp.msat_amount as msat_amount",
    "amp.created_at as created_at",
    "amp.content_type as content_type",
    "npub.metadata as metadata",
    "comment.content as content",
    "amp.user_id as user_id"
  )
  .orderBy("amp.created_at", "desc")
  .where("amp.created_at", ">", FILTER_DATE);

////// FUNCTIONS //////

const getPlaylistActivityMetadata = async (playlists: any[]) => {
  const createdPlaylistActivity: ActivityItem[] = [];
  for (const playlist of playlists) {
    const tracks = await db
      .knex("playlist_track")
      .select(
        "track_info.artwork_url as artworkUrl",
        "playlist_track.order_int as order"
      )
      .join("track_info", "track_info.id", "=", "playlist_track.track_id")
      .where("playlist_track.playlist_id", playlist.id)
      .orderBy("playlist_track.order_int", "asc");

    if (tracks.length !== 0) {
      createdPlaylistActivity.push({
        picture: playlist.metadata?.picture,
        name: playlist.metadata?.name,
        userId: playlist.user_id,
        type: "playlistCreate",
        timestamp: playlist.updated_at,
        contentId: playlist.id,
        contentTitle: playlist.title,
        parentContentTitle: `${tracks.length} track${
          tracks.length > 1 ? "s" : ""
        }`,
        contentType: "playlist",
        contentArtwork: tracks.map((track) => track.artworkUrl),
      });
    }
  }
  return createdPlaylistActivity;
};

const getZappedContentActivityMetadata = async (zaps: any[]) => {
  const zappedContent = await Promise.all(
    zaps.map(async (zap: any): Promise<ActivityItem> => {
      const { parentId, contentType: parentContentType } =
        await getParentContentTypeAndId(zap.content_id);
      const content = await getContentFromId(zap.content_id);
      const activity = {
        picture: zap.metadata?.picture,
        name: zap.metadata?.name,
        userId: zap.user_id,
        type: "zap" as ActivityType,
        message: zap.content,
        zapAmount: zap.msat_amount,
        timestamp: zap.created_at,
        contentId: zap.content_id,
        contentTitle: content?.title,
        parentContentId: parentId,
        contentType: zap.content_type,
        contentArtwork: [content?.artwork_url],
      };
      if (parentContentType === "album") {
        const album = await db
          .knex("album")
          .select("*")
          .where("id", parentId)
          .then((data) => {
            return data[0];
          });
        return {
          ...activity,
          parentContentTitle: album?.title,
          parentContentType,
          contentArtwork: [album.artwork_url],
        };
      } else if (parentContentType === "podcast") {
        const podcast = await db
          .knex("podcast")
          .select("*")
          .where("id", parentId)
          .then((data) => {
            return data[0];
          });
        return {
          ...activity,
          parentContentTitle: podcast.name,
          parentContentType,
          contentArtwork: [podcast.artwork_url],
        };
      } else if (parentContentType === "artist") {
        const artist = await db
          .knex("artist")
          .select("*")
          .where("id", parentId)
          .then((data) => {
            return data[0];
          });
        return {
          ...activity,
          parentContentTitle: artist.name,
          parentContentType,
          contentArtwork: [content.artwork_url],
        };
      }

      return activity;
    })
  );

  return zappedContent;
};

const getNewTracksActivityMetadata = async (tracks: any[]) => {
  const newTracksActivity: ActivityItem[] = [];
  for (const track of tracks) {
    // get the artist pubkey in hex
    const { type, data } = nip19.decode(track.artist_npub);
    const artistMetadata = await db
      .knex("npub")
      .select("metadata")
      .where("public_hex", data)
      .then((data) => {
        if (data.length === 0) {
          return {};
        }
        return data[0];
      });

    newTracksActivity.push({
      picture: artistMetadata.metadata?.picture,
      name: artistMetadata.metadata?.name,
      userId: data as string,
      type: "trackPublish",
      timestamp: track.created_at,
      contentId: track.id,
      contentTitle: track.contentTitle,
      contentType: "track",
      contentArtwork: [track.contentArtwork],
      parentContentId: track.parentContentId,
      parentContentTitle: track.parentContentTitle,
      parentContentType: "album",
    });
  }
  return newTracksActivity;
};

const getNpubs = async (hexList: string[]) => {
  let npubs: string[] = [];
  hexList.forEach(async (hex) => {
    npubs.push(nip19.npubEncode(hex));
  });
  return npubs;
};

const getActivity = async (
  pubkeys: string[] | null,
  limit: number,
  offset: number = 0
) => {
  let createdPlaylists: any[] = [];
  let createdTracks: any[] = [];
  let zaps: any[] = [];
  if (!pubkeys) {
    // if no pubkeys are provided, get all playlist activity that has a pubkey (string length 64)
    createdPlaylists = await PLAYLIST_QUERY.whereRaw("LENGTH(user_id) = 64");
    zaps = await ZAP_QUERY.whereRaw("LENGTH(amp.user_id) = 64");
    createdTracks = await NEW_TRACKS_QUERY.whereRaw(
      "LENGTH(track_info.artist_npub) = 64"
    );
  } else {
    const npubs = await getNpubs(pubkeys);
    createdPlaylists = await PLAYLIST_QUERY.whereIn("user_id", pubkeys);
    zaps = await ZAP_QUERY.whereIn("amp.user_id", pubkeys);
    createdTracks = await NEW_TRACKS_QUERY.whereIn(
      "track_info.artist_npub",
      npubs
    );
  }

  // get the content metadata for all activity items
  const createdPlaylistActivity = await getPlaylistActivityMetadata(
    createdPlaylists
  );
  const zapActivity = await getZappedContentActivityMetadata(zaps);

  const trackActivity = await getNewTracksActivityMetadata(createdTracks);

  const combinedActivity = [
    ...createdPlaylistActivity,
    ...zapActivity,
    ...trackActivity,
  ];
  // sort the activity by timestamp
  const sortedActivity = combinedActivity.sort((a, b) => {
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

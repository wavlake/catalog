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

type ActivityType = "playlistCreate" | "zap" | "updatePlaylist";

interface ActivityItem {
  picture: string;
  name: string;
  userId: string;
  pubkey: string;
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

const THREE_MONTHS_AGO = new Date();
THREE_MONTHS_AGO.setMonth(THREE_MONTHS_AGO.getMonth() - 3);
const FILTER_DATE = THREE_MONTHS_AGO.toISOString()
  .slice(0, 19)
  .replace("T", " ");

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
        pubkey: playlist.user_id,
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
        pubkey: zap.user_id,
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

const getActivity = async (
  pubkeys: string[] | null,
  limit: number,
  offset: number = 0
) => {
  let createdPlaylists: any[] = [];
  let zaps: any[] = [];
  if (!pubkeys) {
    // if no pubkeys are provided, get all playlist activity that has a pubkey (string length 64)
    createdPlaylists = await PLAYLIST_QUERY.whereRaw("LENGTH(user_id) = 64");
    zaps = await ZAP_QUERY.whereRaw("LENGTH(amp.user_id) = 64");
  } else {
    createdPlaylists = await PLAYLIST_QUERY.whereIn("user_id", pubkeys);
    zaps = await ZAP_QUERY.whereIn("amp.user_id", pubkeys);
  }

  const createdPlaylistActivity = await getPlaylistActivityMetadata(
    createdPlaylists
  );
  const zapActivity = await getZappedContentActivityMetadata(zaps);

  const combinedActivity = [...createdPlaylistActivity, ...zapActivity];
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

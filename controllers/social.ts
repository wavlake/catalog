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

const getActivity = async (
  pubkeys: string[] | null,
  limit: number,
  offset: number = 0
) => {
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const filterDate = threeMonthsAgo
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");

  const playlistQuery = db
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
    .where("playlist.updated_at", ">", filterDate);

  const zapQuery = db
    .knex("amp")
    .andWhere("amp.comment", true)
    .andWhere("amp.type", 7)
    .join("npub", "amp.user_id", "=", "npub.public_hex")
    .leftJoin("comment", "comment.amp_id", "=", "amp.id")
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
    .where("amp.created_at", ">", filterDate);

  let createdPlaylists: any[] = [];
  let zaps: any[] = [];
  if (!pubkeys) {
    // if no pubkeys are provided, get all playlist activity that has a pubkey (string length 64)
    createdPlaylists = await playlistQuery.whereRaw("LENGTH(user_id) = 64");
    zaps = await zapQuery.whereRaw("LENGTH(amp.user_id) = 64");
  } else {
    createdPlaylists = await playlistQuery.whereIn("user_id", pubkeys);
    zaps = await zapQuery.whereIn("amp.user_id", pubkeys);
  }

  const createdPlaylistActivity: ActivityItem[] = [];
  for (const playlist of createdPlaylists) {
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

  const zapActivity = await Promise.all(
    zaps.map(async (zap) => {
      const { parentId, contentType: parentContentType } =
        await getParentContentTypeAndId(zap.content_id);
      const content = await getContentFromId(zap.content_id);
      const activity = {
        picture: zap.metadata?.picture,
        name: zap.metadata?.name,
        userId: zap.user_id,
        pubkey: zap.user_id,
        type: "zap",
        message: zap.content,
        zapAmount: zap.msat_amount,
        timestamp: zap.created_at,
        contentId: zap.content_id,
        contentTitle: content.title,
        parentContentId: parentId,
        contentType: zap.content_type,
        contentArtwork: [content.artwork_url],
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
          parentContentTitle: album.title,
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

interface Follow extends Prisma.JsonArray {
  pubkey: string;
  relay?: string;
  petname?: string;
}

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

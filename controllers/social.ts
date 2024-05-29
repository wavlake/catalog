import prisma from "../prisma/client";
import asyncHandler from "express-async-handler";
import { Prisma } from "@prisma/client";
import db from "../library/db";

interface ActivityItem {
  //npub metadata
  picture: string;
  name: string;
  userId: string;
  pubkey: string;
  // playlistCreate
  // playlistUpdate
  // zap
  type: string;

  // amp table
  message?: string;
  zapAmount?: number;

  // amp table or playlist table
  timestamp: string;

  // playlist table/amp table
  contentId: string;
  contentTitle: string;
  contentType: string;
  contentArtwork: string[];
  parentContentId?: string;
  parentContentTitle?: string;
  parentContentType?: string;
}

const getActivity = async (pubkeys: string[]) => {
  const createdPlaylists = await db
    .knex("playlist")
    .whereIn("user_id", pubkeys)
    .join("npub", "playlist.user_id", "npub.public_hex")
    .select(
      "playlist.id as id",
      "playlist.user_id as user_id",
      "playlist.title as title",
      "playlist.updated_at as updated_at",
      "npub.metadata as metadata"
    )
    .orderBy("playlist.created_at", "desc");

  const createdPlaylistActivity = await Promise.all(
    createdPlaylists.map(async (playlist) => {
      const tracks = await db
        .knex("playlist_track")
        .select(
          "track_info.artwork_url as artworkUrl",
          "playlist_track.order_int as order"
        )
        .join("track_info", "track_info.id", "=", "playlist_track.track_id")
        .where("playlist_track.playlist_id", playlist.id)
        .orderBy("playlist_track.order_int", "asc");
      return {
        picture: playlist.metadata?.picture,
        name: playlist.metadata?.name,
        userId: playlist.user_id,
        pubkey: playlist.user_id,
        type: "playlistCreate",
        timestamp: playlist.created_at,
        contentId: playlist.id,
        contentTitle: playlist.title,
        contentType: "playlist",
        contentArtwork: tracks.map((track) => track.artworkUrl),
      };
    })
  );

  return createdPlaylistActivity.sort((a, b) => {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
};

interface Follow extends Prisma.JsonArray {
  pubkey: string;
  relay?: string;
  petname?: string;
}

const get_activity_feed = asyncHandler(async (req, res, next) => {
  const pubkey = req.params.pubkey;

  if (!pubkey) {
    res.status(400).json({ success: false, error: "Must provde a pubkey" });
    return;
  }

  const pubkeyFollows = await prisma.npub.findFirstOrThrow({
    where: {
      publicHex: pubkey,
    },
  });

  const pubkeyList = (pubkeyFollows.follows as Follow[]).map(
    (follow) => follow.pubkey
  );

  const activityItems = await getActivity(pubkeyList);

  res.send({
    success: true,
    data: activityItems,
  });
});

const get_account_activity = asyncHandler(async (req, res, next) => {
  const pubkey = req.params.pubkey;
  if (!pubkey) {
    res.status(400).json({ success: false, error: "Must provde a pubkey" });
    return;
  }

  const activityItems = await getActivity([pubkey]);
  res.send({
    success: true,
    data: activityItems,
  });
});

export default {
  get_activity_feed,
  get_account_activity,
};

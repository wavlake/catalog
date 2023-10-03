import { feature_flag } from "./../node_modules/.prisma/client/index.d";
import db from "../library/db";
import asyncHandler from "express-async-handler";
import { formatError } from "../library/errors";
import prisma from "../prisma/client";

const get_account = asyncHandler(async (req, res, next) => {
  const request = {
    accountId: req["uid"],
  };

  try {
    const userData = await db
      .knex("user")
      .select(
        "user.id as id",
        "user.name as name",
        "user.msat_balance as msatBalance",
        "user.amp_msat as ampMsat",
        "user.artwork_url as artworkUrl",
        "user.profile_url as profileUrl",
        "user.is_locked as isLocked"
      )
      .where("user.id", "=", request.accountId);

    const trackData = await db
      .knex("playlist")
      .join("playlist_track", "playlist.id", "=", "playlist_track.playlist_id")
      .join("track", "track.id", "=", "playlist_track.track_id")
      .select("track.id", "playlist.id as playlistId")
      .where("playlist.user_id", "=", request.accountId)
      .where("playlist.is_favorites", "=", true);

    res.send({
      success: true,
      data: {
        ...userData[0],
        userFavoritesId: (trackData[0] || {}).playlistId,
        userFavorites: trackData.map((track) => track.id),
      },
    });
  } catch (err) {
    next(err);
  }
});

const get_features = asyncHandler(async (req, res, next) => {
  try {
    const userId = req["uid"];

    const flags = await prisma.userFlag.findMany({
      where: {
        userId,
      },
      include: {
        featureFlag: true,
      },
    });

    console.log(flags);

    res.send({
      success: true,
      data: flags.map((flag) => flag.featureFlag.name),
    });
  } catch (err) {
    next(err);
  }
});

export default { get_account, get_features };

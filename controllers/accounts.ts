import db from "../library/db";
import asyncHandler from "express-async-handler";
import prisma from "../prisma/client";
import log from "loglevel";

async function groupSplitPayments(combinedAmps) {
  // Group records by txId
  const grouped = combinedAmps.reduce((acc, curr) => {
    if (!acc[curr.txId]) {
      acc[curr.txId] = [];
    }
    acc[curr.txId].push(curr);
    return acc;
  }, {});

  return grouped;
}

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

    res.send({
      success: true,
      data: flags.map((flag) => flag.featureFlag.name),
    });
  } catch (err) {
    next(err);
  }
});

const get_history = asyncHandler(async (req, res, next) => {
  const page = req.query.page || 1;
  const userId = req["uid"];
  try {
    const internalAmps = db
      .knex("amp")
      .join("track", "track.id", "=", "amp.track_id")
      .join("album", "album.id", "=", "track.album_id")
      .join("artist", "artist.id", "=", "album.artist_id")
      .select(
        "amp.msat_amount as msatAmount",
        "amp.created_at as createdAt",
        "track.title as title",
        "artist.name as name",
        db.knex.raw("0 as fee"),
        "amp.tx_id as txId"
      )
      .where("amp.user_id", "=", userId);

    const externalAmps = db
      .knex("external_payment")
      .select(
        "external_payment.msat_amount as msatAmount",
        "external_payment.created_at as createdAt",
        "external_payment.podcast as title",
        "external_payment.name as name",
        "external_payment.fee_msat as fee",
        "external_payment.tx_id as txId"
      )
      .where("external_payment.user_id", "=", userId);

    const combinedAmps = await internalAmps
      .unionAll(externalAmps)
      .as("combined")
      .orderBy("createdAt", "desc")
      .paginate({
        perPage: 50,
        currentPage: parseInt(page.toString()),
        isLengthAware: true,
      });

    res.json({
      success: true,
      data: {
        history: await groupSplitPayments(combinedAmps.data),
        pagination: {
          currentPage: combinedAmps.pagination.currentPage,
          perPage: combinedAmps.pagination.perPage,
          total: combinedAmps.pagination.total,
          totalPages: combinedAmps.pagination.lastPage,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

export default { get_account, get_features, get_history };

import db from "../library/db";
import asyncHandler from "express-async-handler";
import prisma from "../prisma/client";
import log from "loglevel";

async function groupSplitPayments(combinedAmps) {
  // Group records by txId
  const grouped = combinedAmps.reduce((acc, curr) => {
    // User createdAt as identifier for legacy amps
    const identifier = curr.txId ? curr.txId : curr.createdAt;
    if (!acc[identifier]) {
      acc[identifier] = [];
    }
    acc[identifier].push(curr);
    return acc;
  }, {});

  // convert grouped to array
  return Object.keys(grouped).map((key) => grouped[key]);
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

const get_activity = asyncHandler(async (req, res, next) => {
  const request = {
    accountId: req["uid"],
    page: req.params.page ? req.params.page : "1",
  };

  db.knex("amp")
    .join("preamp", "preamp.tx_id", "=", "amp.tx_id")
    .leftOuterJoin("comment", "comment.tx_id", "=", "amp.tx_id")
    .select(
      "amp.msat_amount as msatAmount",
      "amp.content_type as contentType",
      "amp.user_id as senderId",
      "amp.created_at as createdAt",
      "amp.tx_id as txId",
      "amp.track_id as contentId",
      "preamp.msat_amount as totalMsatAmount",
      "preamp.podcast as podcast",
      "preamp.sender_name as senderName",
      "preamp.episode as episode",
      "preamp.app_name as appName",
      "comment.content as commentContent"
    )
    .where("amp.split_destination", "=", request.accountId)
    .whereNotNull("amp.tx_id")
    .orderBy("amp.created_at", "desc")
    .paginate({
      perPage: 50,
      currentPage: parseInt(request.page),
      isLengthAware: true,
    })
    .then((data) => {
      // console.log(data);
      res.send(data);
    })
    .catch((err) => {
      next(err);
    });
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
      .where("external_payment.user_id", "=", userId)
      .andWhere("external_payment.is_settled", "=", true);

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

export default { get_account, get_activity, get_features, get_history };

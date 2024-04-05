import db from "../library/db";
import asyncHandler from "express-async-handler";
import prisma from "../prisma/client";
import { formatError } from "../library/errors";
const log = require("loglevel");
const { auth } = require("../library/firebaseService");
import { validateLightningAddress } from "../library/zbd/zbdClient";

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
        "user.is_locked as isLocked",
        "user.lightning_address as lightningAddress"
      )
      .where("user.id", "=", request.accountId);

    const trackData = await db
      .knex("playlist")
      .join("playlist_track", "playlist.id", "=", "playlist_track.playlist_id")
      .join("track", "track.id", "=", "playlist_track.track_id")
      .select("track.id", "playlist.id as playlistId")
      .where("playlist.user_id", "=", request.accountId)
      .where("playlist.is_favorites", "=", true);
    const isRegionVerified = await db
      .knex("user_verification")
      .select("first_name")
      .where("user_id", "=", request.accountId)
      .first();

    const { emailVerified, providerData } = await auth().getUser(
      request.accountId
    );

    res.send({
      success: true,
      data: {
        ...userData[0],
        emailVerified,
        isRegionVerified: !!isRegionVerified,
        providerId: providerData[0]?.providerId,
        userFavoritesId: (trackData[0] || {}).playlistId,
        userFavorites: trackData.map((track) => track.id),
      },
    });
  } catch (err) {
    next(err);
    return;
  }
});

const get_activity = asyncHandler(async (req, res, next) => {
  const request = {
    accountId: req["uid"],
  };

  const { page } = req.params;
  const pageInt = parseInt(page);

  // TODO: Add support for legacy amps
  db.knex("amp")
    .join("preamp", "preamp.tx_id", "=", "amp.tx_id")
    .leftOuterJoin("user", "user.id", "=", "amp.user_id")
    .leftOuterJoin("comment", "comment.tx_id", "=", "amp.tx_id")
    .leftOuterJoin("track", "track.id", "=", "amp.track_id")
    .leftOuterJoin("album", "album.id", "=", "amp.track_id")
    .leftOuterJoin("artist", "artist.id", "=", "amp.track_id")
    .leftOuterJoin("episode", "episode.id", "=", "amp.track_id")
    .leftOuterJoin("podcast", "podcast.id", "=", "amp.track_id")
    .select(
      "amp.track_id as contentId",
      "amp.msat_amount as msatAmount",
      "amp.content_type as contentType",
      "amp.user_id as userId",
      "amp.created_at as createdAt",
      "amp.tx_id as txId",
      "amp.track_id as contentId",
      "amp.type as ampType",
      "preamp.msat_amount as totalMsatAmount",
      "preamp.podcast as podcast",
      "preamp.episode as episode",
      "preamp.app_name as appName",
      "comment.content as content",
      "user.artwork_url as commenterArtworkUrl",
      db.knex.raw(
        `COALESCE("artist"."artist_url", "podcast"."podcast_url") as "contentUrl"`
      ),
      db.knex.raw('COALESCE("user"."name", "preamp"."sender_name") as name'),
      db.knex.raw(
        'COALESCE("track"."title", "album"."title", "artist"."name", "episode"."title") as title'
      )
    )
    .where("amp.split_destination", "=", request.accountId)
    .whereNotNull("amp.tx_id")
    .orderBy("amp.created_at", "desc")
    .paginate({
      perPage: 50,
      currentPage: pageInt,
      isLengthAware: true,
    })
    .then((data) => {
      res.send({
        success: true,
        data: { activities: data.data, pagination: data.pagination },
      });
    })
    .catch((err) => {
      next(err);
      return;
    });
});

const get_announcements = asyncHandler(async (req, res, next) => {
  const request = {
    accountId: req["uid"],
  };

  const lastActivityCheckAt = await db
    .knex("user")
    .select("last_activity_check_at")
    .where("id", "=", request.accountId)
    .first()
    .then((data) => {
      return data.last_activity_check_at ?? new Date();
    });

  // Subtract to the last activity check so annoucements last at least 24 hours
  const lastActivityCheckMinus24Hours = new Date(lastActivityCheckAt);
  lastActivityCheckMinus24Hours.setHours(
    lastActivityCheckMinus24Hours.getHours() - 24
  );

  return db
    .knex("announcement")
    .select(
      "id as id",
      "title as title",
      "content as content",
      "created_at as createdAt"
    )
    .where("announcement.created_at", ">", lastActivityCheckMinus24Hours)
    .orderBy("announcement.created_at", "desc")
    .then((data) => {
      res.send({
        success: true,
        data: data,
      });
    });
});

const get_notification = asyncHandler(async (req, res, next) => {
  const request = {
    accountId: req["uid"],
  };

  const lastActivityCheckAt = await db
    .knex("user")
    .select("last_activity_check_at")
    .where("id", "=", request.accountId)
    .first()
    .then((data) => {
      return data.last_activity_check_at ?? new Date();
    });

  const latestAnnouncement = await db
    .knex("announcement")
    .max("created_at")
    .first()
    .then((data) => {
      if (!data?.max) return null;

      return data.max;
    });

  const notifyUser = await db
    .knex("amp")
    .max("created_at")
    .where("split_destination", "=", request.accountId)
    .groupBy("split_destination")
    .first()
    .then((data) => {
      if (!data?.max) return false;

      const latestDate =
        latestAnnouncement > data.max ? latestAnnouncement : data.max;
      return latestDate > lastActivityCheckAt;
    });

  res.send({
    success: true,
    data: { notify: notifyUser },
  });
});

const put_notification = asyncHandler(async (req, res, next) => {
  const request = {
    accountId: req["uid"],
  };

  db.knex("user")
    .update({ last_activity_check_at: db.knex.fn.now() })
    .where("user.id", "=", request.accountId)
    .then(() => {
      res.send({
        success: true,
      });
    })
    .catch((err) => {
      next(err);
      return;
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
    return;
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
    return;
  }
});

const get_txs = asyncHandler(async (req, res, next) => {
  const userId = req["uid"];

  const { page } = req.params;
  const pageInt = parseInt(page);

  const txs = await db
    .knex(transactions(userId))
    .unionAll([forwards(userId)])
    .orderBy("createDate", "desc")
    .paginate({
      perPage: 20,
      currentPage: pageInt,
      isLengthAware: true,
    });

  const txsModified = txs.data.map((tx) => {
    return {
      ...tx,
      feeMsat: tx.feemsat,
      isPending: tx.ispending,
    };
  });

  res.json({
    success: true,
    data: {
      transactions: txsModified,
      pagination: {
        currentPage: txs.pagination.currentPage,
        perPage: txs.pagination.perPage,
        total: txs.pagination.total,
        totalPages: txs.pagination.lastPage,
      },
    },
  });
});

const get_check_region = asyncHandler(async (req, res, next) => {
  // Respond with 200 if request gets past middleware
  res.send(200);
});

const post_log_identity = asyncHandler(async (req, res, next) => {
  const userId = req["uid"];
  const { firstName, lastName } = req.body;

  if (!firstName || !lastName) {
    res.status(400).json({
      success: false,
      error: "First name and last name are required",
    });
    return;
  }

  const userRecord = await auth().getUser(userId);

  if (!userRecord.emailVerified) {
    res.status(400).json({
      success: false,
      error: "Email is not verified",
    });
    return;
  }

  try {
    await prisma.userVerification.upsert({
      where: {
        userId: userId,
      },
      update: {
        firstName: firstName,
        lastName: lastName,
        ip: req.ip,
      },
      create: {
        userId: userId,
        firstName: firstName,
        lastName: lastName,
        ip: req.ip,
      },
    });

    res.send({
      success: true,
      data: { userId: userId },
    });
  } catch (err) {
    next(err);
    return;
  }
});

const create_update_lnaddress = asyncHandler(async (req, res, next) => {
  const userId = req["uid"];
  const { lightningAddress } = req.body;

  if (!lightningAddress) {
    res.status(400).json({
      success: false,
      error: "Address is required",
    });
    return;
  }

  const isValidAddress = await validateLightningAddress(lightningAddress);

  if (!isValidAddress) {
    res.status(400).json({
      success: false,
      error: "Invalid lightning address",
    });
    return;
  }

  try {
    await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        lightningAddress: lightningAddress,
      },
    });

    res.send({
      success: true,
      data: { userId: userId, lightningAddress: lightningAddress },
    });
  } catch (err) {
    next(err);
    return;
  }
});

// QUERY FUNCTIONS

function transactions(userId) {
  return db
    .knex("transaction")
    .select(
      "transaction.payment_request as paymentid",
      "transaction.fee_msat as feemsat",
      "transaction.success as success",
      db.knex.raw("'Transaction' as type"),
      "transaction.is_pending as ispending",
      "transaction.withdraw as withdraw",
      "transaction.id as id",
      "transaction.msat_amount as msatAmount",
      "transaction.failure_reason as failureReason",
      "transaction.created_at as createDate"
    )
    .where("transaction.user_id", "=", userId)
    .as("transactions");
}

function forwards(userId) {
  return db
    .knex("forward_detail")
    .join(
      "forward",
      "forward.external_payment_id",
      "=",
      "forward_detail.external_payment_id"
    )
    .select(
      "forward_detail.external_payment_id as paymentid",
      db.knex.raw("0 as feeMsat"),
      db.knex.raw("bool_and(forward_detail.success) as success"),
      db.knex.raw("'Forward' as type"),
      db.knex.raw("false as ispending"),
      db.knex.raw("false as withdraw")
    )
    .min("forward_detail.id as id")
    .min("forward_detail.msat_amount as msatAmount")
    .min("forward_detail.error as failureReason")
    .min("forward_detail.created_at as createDate")
    .groupBy("forward_detail.external_payment_id", "forward_detail.created_at")
    .where("forward.user_id", "=", userId);
}

export default {
  create_update_lnaddress,
  get_account,
  get_activity,
  get_announcements,
  get_notification,
  put_notification,
  get_features,
  get_history,
  get_txs,
  get_check_region,
  post_log_identity,
};

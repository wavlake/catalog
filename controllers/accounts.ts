import db from "../library/db";
import asyncHandler from "express-async-handler";
import prisma from "../prisma/client";
import { formatError } from "../library/errors";

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
  };

  const { page } = req.params;

  const pageInt = parseInt(page);
  if (!Number.isInteger(pageInt) || pageInt <= 0) {
    const error = formatError(400, "Page must be a positive integer");
    next(error);
    return;
  }

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
        'COALESCE("artist"."artist_url", "podcast"."podcast_url") as contentUrl'
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
      // console.log(data);
      res.send({
        success: true,
        data: { activities: data.data, pagination: data.pagination },
      });
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

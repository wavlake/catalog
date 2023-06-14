const log = require("loglevel");
import db from "../library/db";
const { randomUUID } = require("crypto");
const Jimp = require("jimp");
const fs = require("fs");
const s3Client = require("../library/s3Client");
const multer = require("multer");
const format = require("../library/format");
const { wavlakeErrorHandler } = require("../library/errorHandler");

const imagePrefix = `${process.env.AWS_S3_IMAGE_PREFIX}`;
const localConvertPath = `${process.env.LOCAL_CONVERT_PATH}`;
const cdnDomain = `${process.env.AWS_CDN_DOMAIN}`;

// Error handling
// Ref: https://stackoverflow.com/questions/43356705/node-js-express-error-handling-middleware-with-router
const handleErrorAsync = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    next(error);
  }
};

const get_account = handleErrorAsync(async (req, res, next) => {
  const request = {
    accountId: req.uid,
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

    res.send([
      {
        ...userData[0],
        userFavoritesId: (trackData[0] || {}).playlistId,
        userFavorites: trackData.map((track) => track.id),
      },
    ]);
  } catch (err) {
    wavlakeErrorHandler(`Error in get_account: ${err}`);
    next(err);
  }
});

export default { get_account };

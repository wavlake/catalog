import log from "loglevel";
import db from "../library/db";

// const topFortyWindow = `${process.env.TOP_FORTY_WINDOW}`;
const topFortyWindow = 30;

// Error handling
// Ref: https://stackoverflow.com/questions/43356705/node-js-express-error-handling-middleware-with-router
const handleErrorAsync = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    next(error);
  }
};

// Top 40
const get_index_top = handleErrorAsync(async (req, res, next) => {
  const request = {
    limit: req.query.limit ? req.query.limit : 41,
    // sortBy: req.body.sortBy
  };

  const d = new Date();
  const dStart = new Date();
  dStart.setDate(d.getDate() - topFortyWindow);
  // console.log(dStart)

  db.knex
    .select("amp.track_id as id", "track.album_id as albumId")
    .join("track", "amp.track_id", "=", "track.id")
    .join("artist", "track.artist_id", "=", "artist.id")
    .join("album", "album.id", "=", "track.album_id")
    .sum("amp.msat_amount as windowMsatAmount")
    .min("track.title as title")
    .min("artist.name as artist")
    .min("artist.artist_url as artistUrl")
    .min("artist.artwork_url as avatarUrl")
    .min("artist.user_id as ownerId")
    .min("album.artwork_url as artworkUrl")
    .min("album.title as albumTitle")
    .min("track.msat_total as msatTotal")
    .min("track.live_url as liveUrl")
    .min("track.duration as duration")
    .min("track.created_at as createDate")
    .where("amp.created_at", "<", d.toISOString().slice(0, 10))
    .andWhere("amp.created_at", ">", dStart.toISOString().slice(0, 10))
    .andWhere("track.deleted", "=", false)
    .from("amp")
    .groupBy("amp.track_id", "track.album_id")
    .orderBy("windowMsatAmount", "desc")
    .limit(request.limit)
    .then((data) => {
      res.send(data);
    })
    .catch((err) => {
      log.debug(`Error querying track table for Top 40: ${err}`);
      next(err);
    });
});

export default {
  get_index_top,
};

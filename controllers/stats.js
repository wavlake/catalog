const log = require("loglevel");
import db from "../library/db";
const asyncHandler = require("express-async-handler");

const get_earnings_by_account = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
  };

  const d = new Date();
  d.setDate(d.getDate() - 30);

  db.knex("track")
    .join("amp", "track.id", "=", "amp.track_id")
    .join("artist", "artist.id", "=", "track.artist_id")
    .sum("amp.msat_amount as msatTotal")
    .where("artist.user_id", "=", request.userId)
    .andWhere("amp.created_at", ">", d.toISOString().slice(0, 10))
    .groupBy("artist.user_id")
    .then((data) => {
      // console.log(data)
      res.send({ success: true, data: data });
    })
    .catch((err) => {
      log.debug(`Error querying user artists amps: ${err}`);
      next(err);
    });
});

const get_plays_by_account = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
  };

  const d = new Date();
  d.setDate(d.getDate() - 30);

  db.knex("track")
    .join("play", "track.id", "=", "play.track_id")
    .join("artist", "artist.id", "=", "track.artist_id")
    .count("play.id as playTotal")
    .where("artist.user_id", "=", request.userId)
    .andWhere("play.created_at", ">", d.toISOString().slice(0, 10))
    .groupBy("artist.user_id")
    .then((data) => {
      // console.log(data)
      res.send({ success: true, data: data });
    })
    .catch((err) => {
      log.debug(`Error querying user artists amps: ${err}`);
      next(err);
    });
});

export default { get_earnings_by_account, get_plays_by_account };

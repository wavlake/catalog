const log = require("loglevel");
import db from "../library/db";
const asyncHandler = require("express-async-handler");
import { formatError } from "../library/errors";

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
      const formatted = data.map((item) => {
        return {
          msatTotal: parseInt(item.msatTotal),
          createdAt: item.created_at,
        };
      });
      res.send({ success: true, data: formatted });
    })
    .catch((err) => {
      const error = formatError(
        500,
        "There was a problem retrieving earnings data"
      );
      throw error;
    });
});

const get_earnings_by_account_daily = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
  };

  const d = new Date();
  d.setDate(d.getDate() - 30);

  const groupBy = db.knex.raw("cast(?? AS date)", ["amp.created_at"]);

  db.knex("track")
    .join("amp", "track.id", "=", "amp.track_id")
    .join("artist", "artist.id", "=", "track.artist_id")
    .sum("amp.msat_amount as msatTotal")
    .select("artist.user_id", groupBy)
    .where("artist.user_id", "=", request.userId)
    .andWhere("amp.created_at", ">", d.toISOString().slice(0, 10))
    .groupBy([groupBy, "artist.user_id"])
    // @ts-ignore
    .orderBy(groupBy, "asc")
    .then((data) => {
      const formatted = data.map((item) => {
        return {
          msatTotal: parseInt(item.msatTotal),
          createdAt: item.created_at,
        };
      });
      res.send({ success: true, data: formatted });
    })
    .catch((err) => {
      const error = formatError(
        500,
        "There was a problem retrieving earnings data"
      );
      throw error;
    });
});

const get_earnings_by_tracks = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
  };

  const d = new Date();
  d.setDate(d.getDate() - 30);

  db.knex("track")
    .join("amp", "track.id", "=", "amp.track_id")
    .join("artist", "artist.id", "=", "track.artist_id")
    .select("track.id as trackId")
    .sum("amp.msat_amount as msatTotal")
    .where("artist.user_id", "=", request.userId)
    .andWhere("amp.created_at", ">", d.toISOString().slice(0, 10))
    .groupBy("trackId")
    .then((data) => {
      const formatted = data.map((item) => {
        return {
          msatTotal: parseInt(item.msatTotal),
          trackId: item.trackId,
        };
      });
      res.send({ success: true, data: formatted });
    })
    .catch((err) => {
      log.error(err);
      const error = formatError(
        500,
        "There was a problem retrieving earnings data"
      );
      throw error;
    });
});

const get_earnings_by_tracks_daily = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
  };

  const d = new Date();
  d.setDate(d.getDate() - 30);

  const groupBy = db.knex.raw("cast(?? AS date)", ["amp.created_at"]);

  db.knex("track")
    .join("amp", "track.id", "=", "amp.track_id")
    .join("artist", "artist.id", "=", "track.artist_id")
    .select("track.id as trackId", groupBy)
    .sum("amp.msat_amount as msatTotal")
    .where("artist.user_id", "=", request.userId)
    .andWhere("amp.created_at", ">", d.toISOString().slice(0, 10))
    .groupBy([groupBy, "trackId"])
    .then((data) => {
      const formatted = data.map((item) => {
        return {
          msatTotal: parseInt(item.msatTotal),
          trackId: item.trackId,
          createdAt: item.created_at,
        };
      });
      res.send({ success: true, data: formatted });
    })
    .catch((err) => {
      log.error(err);
      const error = formatError(
        500,
        "There was a problem retrieving earnings data"
      );
      throw error;
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
      res.send({ success: true, data: data });
    })
    .catch((err) => {
      log.error(err);
      const error = formatError(
        500,
        "There was a problem retrieving play data"
      );
      throw error;
    });
});

const get_plays_by_account_daily = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
  };

  const d = new Date();
  d.setDate(d.getDate() - 30);

  const groupBy = db.knex.raw("cast(?? AS date)", ["play.created_at"]);

  db.knex("track")
    .join("play", "track.id", "=", "play.track_id")
    .join("artist", "artist.id", "=", "track.artist_id")
    .select(groupBy)
    .count("play.id as playTotal")
    .where("artist.user_id", "=", request.userId)
    .andWhere("play.created_at", ">", d.toISOString().slice(0, 10))
    .groupBy([groupBy, "artist.user_id"])
    .then((data) => {
      const formatted = data.map((item) => {
        return {
          playTotal: parseInt(item.playTotal),
          createdAt: item.created_at,
        };
      });
      res.send({ success: true, data: formatted });
    })
    .catch((err) => {
      log.error(err);
      const error = formatError(
        500,
        "There was a problem retrieving play data"
      );
      throw error;
    });
});

const get_plays_by_tracks = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
  };

  const d = new Date();
  d.setDate(d.getDate() - 30);

  db.knex("track")
    .join("play", "track.id", "=", "play.track_id")
    .join("artist", "artist.id", "=", "track.artist_id")
    .select("track.id as trackId")
    .count("play.id as playTotal")
    .where("artist.user_id", "=", request.userId)
    .andWhere("play.created_at", ">", d.toISOString().slice(0, 10))
    .groupBy("trackId")
    .then((data) => {
      const formatted = data.map((item) => {
        return {
          playTotal: parseInt(item.playTotal),
          trackId: item.trackId,
        };
      });
      res.send({ success: true, data: formatted });
    })
    .catch((err) => {
      log.error(err);
      const error = formatError(
        500,
        "There was a problem retrieving play data"
      );
      throw error;
    });
});

const get_plays_by_tracks_daily = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
  };

  const d = new Date();
  d.setDate(d.getDate() - 30);

  const groupBy = db.knex.raw("cast(?? AS date)", ["play.created_at"]);

  db.knex("track")
    .join("play", "track.id", "=", "play.track_id")
    .join("artist", "artist.id", "=", "track.artist_id")
    .select("track.id as trackId", groupBy)
    .count("play.id as playTotal")
    .where("artist.user_id", "=", request.userId)
    .andWhere("play.created_at", ">", d.toISOString().slice(0, 10))
    .groupBy([groupBy, "track.id"])
    // @ts-ignore
    .orderBy(groupBy, "asc")
    .then((data) => {
      const formatted = data.map((item) => {
        return {
          playTotal: parseInt(item.playTotal),
          trackId: item.trackId,
          createdAt: item.created_at,
        };
      });
      res.send({ success: true, data: formatted });
    })
    .catch((err) => {
      log.error(err);
      const error = formatError(
        500,
        "There was a problem retrieving play data"
      );
      throw error;
    });
});

export default {
  get_earnings_by_account,
  get_earnings_by_account_daily,
  get_earnings_by_tracks,
  get_earnings_by_tracks_daily,
  get_plays_by_account,
  get_plays_by_account_daily,
  get_plays_by_tracks,
  get_plays_by_tracks_daily,
};

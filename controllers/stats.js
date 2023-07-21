const log = require("loglevel");
import db from "../library/db";
const asyncHandler = require("express-async-handler");
import { formatError } from "../library/errors";

const d = new Date();
const d30 = new Date();
d30.setDate(d.getDate() - 30);
d30.toISOString().slice(0, 10);

const get_earnings_by_account = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
  };

  db.knex("track")
    .join("amp", "track.id", "=", "amp.track_id")
    .join("artist", "artist.id", "=", "track.artist_id")
    .sum("amp.msat_amount as msatTotal")
    .where("artist.user_id", "=", request.userId)
    .andWhere("amp.created_at", ">", d30)
    .groupBy("artist.user_id")
    .then((data) => {
      const formatted = data.map((item) => {
        return {
          msatTotal: parseInt(item.msatTotal),
        };
      });
      res.send({ success: true, data: formatted[0] });
    })
    .catch((err) => {
      const error = formatError(
        500,
        "There was a problem retrieving earnings data"
      );
      throw error;
    });
});

const get_earnings_all_time_by_account = asyncHandler(
  async (req, res, next) => {
    const request = {
      userId: req["uid"],
    };

    db.knex("track")
      .join("amp", "track.id", "=", "amp.track_id")
      .join("artist", "artist.id", "=", "track.artist_id")
      .sum("amp.msat_amount as msatTotal")
      .where("artist.user_id", "=", request.userId)
      .groupBy("artist.user_id")
      .then((data) => {
        const formatted = data.map((item) => {
          return {
            msatTotal: parseInt(item.msatTotal),
          };
        });
        res.send({ success: true, data: formatted[0] });
      })
      .catch((err) => {
        const error = formatError(
          500,
          "There was a problem retrieving earnings data"
        );
        throw error;
      });
  }
);

const get_earnings_all_time_by_account_weekly = asyncHandler(
  async (req, res, next) => {
    const request = {
      userId: req["uid"],
    };

    const groupBy = db.knex.raw(
      "CONCAT(DATE_PART('year',??),'-',DATE_PART('week',??))",
      ["amp.created_at", "amp.created_at"]
    );

    db.knex("track")
      .join("amp", "track.id", "=", "amp.track_id")
      .join("artist", "artist.id", "=", "track.artist_id")
      .sum("amp.msat_amount as msatTotal")
      .select("artist.user_id", groupBy)
      .where("artist.user_id", "=", request.userId)
      .groupBy([groupBy, "artist.user_id"])
      // @ts-ignore
      .orderBy(groupBy, "asc")
      .then((data) => {
        const formatted = data.map((item) => {
          return {
            msatTotal: parseInt(item.msatTotal),
            createdAt: formatWeek(item.concat),
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
  }
);

const get_earnings_by_account_daily = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
  };

  const groupBy = db.knex.raw("cast(?? AS date)", ["amp.created_at"]);

  db.knex("track")
    .join("amp", "track.id", "=", "amp.track_id")
    .join("artist", "artist.id", "=", "track.artist_id")
    .sum("amp.msat_amount as msatTotal")
    .select("artist.user_id", groupBy)
    .where("artist.user_id", "=", request.userId)
    .andWhere("amp.created_at", ">", d30)
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

  db.knex("track")
    .join("amp", "track.id", "=", "amp.track_id")
    .join("artist", "artist.id", "=", "track.artist_id")
    .select("track.id as trackId")
    .sum("amp.msat_amount as msatTotal")
    .where("artist.user_id", "=", request.userId)
    .andWhere("amp.created_at", ">", d30)
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

  const groupBy = db.knex.raw("cast(?? AS date)", ["amp.created_at"]);

  db.knex("track")
    .join("amp", "track.id", "=", "amp.track_id")
    .join("artist", "artist.id", "=", "track.artist_id")
    .select("track.id as trackId", groupBy)
    .sum("amp.msat_amount as msatTotal")
    .where("artist.user_id", "=", request.userId)
    .andWhere("amp.created_at", ">", d30)
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

  db.knex("track")
    .join("play", "track.id", "=", "play.track_id")
    .join("artist", "artist.id", "=", "track.artist_id")
    .count("play.id as playTotal")
    .where("artist.user_id", "=", request.userId)
    .andWhere("play.created_at", ">", d30)
    .groupBy("artist.user_id")
    .then((data) => {
      res.send({ success: true, data: data[0] });
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

const get_plays_all_time_by_account = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
  };

  db.knex("track")
    .join("play", "track.id", "=", "play.track_id")
    .join("artist", "artist.id", "=", "track.artist_id")
    .count("play.id as playTotal")
    .where("artist.user_id", "=", request.userId)
    .groupBy("artist.user_id")
    .then((data) => {
      res.send({ success: true, data: data[0] });
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

const get_plays_all_time_by_account_weekly = asyncHandler(
  async (req, res, next) => {
    const request = {
      userId: req["uid"],
    };

    const groupBy = db.knex.raw(
      "CONCAT(DATE_PART('year',??),'-',DATE_PART('week',??))",
      ["play.created_at", "play.created_at"]
    );

    db.knex("track")
      .join("play", "track.id", "=", "play.track_id")
      .join("artist", "artist.id", "=", "track.artist_id")
      .select(groupBy)
      .count("play.id as playTotal")
      .where("artist.user_id", "=", request.userId)
      .groupBy([groupBy, "artist.user_id"])
      .then((data) => {
        const formatted = data.map((item) => {
          return {
            playTotal: parseInt(item.playTotal),
            createdAt: formatWeek(item.concat),
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
  }
);

const get_plays_by_account_daily = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
  };

  const groupBy = db.knex.raw("cast(?? AS date)", ["play.created_at"]);

  db.knex("track")
    .join("play", "track.id", "=", "play.track_id")
    .join("artist", "artist.id", "=", "track.artist_id")
    .select(groupBy)
    .count("play.id as playTotal")
    .where("artist.user_id", "=", request.userId)
    .andWhere("play.created_at", ">", d30)
    .groupBy([groupBy, "artist.user_id"])
    .then((data) => {
      const formatted = data.map((item) => {
        return {
          createdAt: item.created_at,
          playTotal: parseInt(item.playTotal),
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

  db.knex("track")
    .join("play", "track.id", "=", "play.track_id")
    .join("artist", "artist.id", "=", "track.artist_id")
    .select("track.id as trackId")
    .count("play.id as playTotal")
    .where("artist.user_id", "=", request.userId)
    .andWhere("play.created_at", ">", d30)
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

  const groupBy = db.knex.raw("cast(?? AS date)", ["play.created_at"]);

  db.knex("track")
    .join("play", "track.id", "=", "play.track_id")
    .join("artist", "artist.id", "=", "track.artist_id")
    .select("track.id as trackId", groupBy)
    .count("play.id as playTotal")
    .where("artist.user_id", "=", request.userId)
    .andWhere("play.created_at", ">", d30)
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

function formatWeek(s) {
  const [year, week] = s.split("-");
  return `${year}-${week.padStart(2, "0")}`;
}

export default {
  get_earnings_by_account,
  get_earnings_all_time_by_account,
  get_earnings_all_time_by_account_weekly,
  get_earnings_by_account_daily,
  get_earnings_by_tracks,
  get_earnings_by_tracks_daily,
  get_plays_by_account,
  get_plays_all_time_by_account,
  get_plays_all_time_by_account_weekly,
  get_plays_by_account_daily,
  get_plays_by_tracks,
  get_plays_by_tracks_daily,
};

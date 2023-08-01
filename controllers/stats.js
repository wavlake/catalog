const log = require("loglevel");
import db from "../library/db";
const asyncHandler = require("express-async-handler");
import { formatError } from "../library/errors";
import prisma from "../prisma/client";

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
    .andWhere("track.deleted", "=", false)
    .andWhere("amp.created_at", ">", d30)
    .groupBy("artist.user_id")
    .then((data) => {
      if (data.length === 0) {
        res.send({ success: true, data: { msatTotal: 0 } });
        return;
      }
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
      next(error);
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
      .andWhere("track.deleted", "=", false)
      .groupBy("artist.user_id")
      .then((data) => {
        if (data.length === 0) {
          res.send({ success: true, data: { msatTotal: 0 } });
          return;
        }
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
        next(error);
      });
  }
);

const get_earnings_all_time_by_account_monthly = asyncHandler(
  async (req, res, next) => {
    const request = {
      userId: req["uid"],
    };

    const groupBy = db.knex.raw(
      "CONCAT(DATE_PART('year',??),'-',DATE_PART('month',??))",
      ["amp.created_at", "amp.created_at"]
    );

    db.knex("track")
      .join("amp", "track.id", "=", "amp.track_id")
      .join("artist", "artist.id", "=", "track.artist_id")
      .sum("amp.msat_amount as msatTotal")
      .select("artist.user_id", groupBy)
      .where("artist.user_id", "=", request.userId)
      .andWhere("track.deleted", "=", false)
      .groupBy([groupBy, "artist.user_id"])
      // @ts-ignore
      .orderBy(groupBy, "asc")
      .then((data) => {
        if (data.length === 0) {
          res.send({ success: true, data: data });
          return;
        }
        const formatted = data.map((item) => {
          return {
            msatTotal: parseInt(item.msatTotal),
            createdAt: formatMonth(item.concat),
          };
        });
        res.send({ success: true, data: formatted });
      })
      .catch((err) => {
        const error = formatError(
          500,
          "There was a problem retrieving earnings data"
        );
        next(error);
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
    .andWhere("track.deleted", "=", false)
    .andWhere("amp.created_at", ">", d30)
    .groupBy([groupBy, "artist.user_id"])
    // @ts-ignore
    .orderBy(groupBy, "asc")
    .then((data) => {
      if (data.length === 0) {
        res.send({ success: true, data: data });
        return;
      }
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
      next(error);
    });
});

const get_earnings_by_tracks = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
  };

  db.knex("track")
    .join("amp", "track.id", "=", "amp.track_id")
    .join("artist", "artist.id", "=", "track.artist_id")
    .select("track.id as trackId", "track.title as title")
    .sum("amp.msat_amount as msatTotal")
    .where("artist.user_id", "=", request.userId)
    .andWhere("track.deleted", "=", false)
    .andWhere("amp.created_at", ">", d30)
    .groupBy("trackId")
    .orderBy("msatTotal", "desc")
    .then((data) => {
      if (data.length === 0) {
        res.send({ success: true, data: data });
        return;
      }
      const formatted = data.map((item) => {
        return {
          msatTotal: parseInt(item.msatTotal),
          trackId: item.trackId,
          title: item.title,
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
      next(error);
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
    .andWhere("track.deleted", "=", false)
    .andWhere("amp.created_at", ">", d30)
    .groupBy([groupBy, "trackId"])
    .then((data) => {
      if (data.length === 0) {
        res.send({ success: true, data: data });
        return;
      }
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
      next(error);
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
    .andWhere("track.deleted", "=", false)
    .andWhere("play.created_at", ">", d30)
    .groupBy("artist.user_id")
    .then((data) => {
      if (data.length === 0) {
        res.send({ success: true, data: { playTotal: 0 } });
        return;
      }
      res.send({ success: true, data: data[0] });
    })
    .catch((err) => {
      log.error(err);
      const error = formatError(
        500,
        "There was a problem retrieving play data"
      );
      next(error);
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
    .andWhere("track.deleted", "=", false)
    .groupBy("artist.user_id")
    .then((data) => {
      if (data.length === 0) {
        res.send({ success: true, data: { playTotal: 0 } });
        return;
      }
      res.send({ success: true, data: data[0] });
    })
    .catch((err) => {
      log.error(err);
      const error = formatError(
        500,
        "There was a problem retrieving play data"
      );
      next(error);
    });
});

const get_plays_all_time_by_account_monthly = asyncHandler(
  async (req, res, next) => {
    const request = {
      userId: req["uid"],
    };

    const groupBy = db.knex.raw(
      "CONCAT(DATE_PART('year',??),'-',DATE_PART('month',??))",
      ["play.created_at", "play.created_at"]
    );

    db.knex("track")
      .join("play", "track.id", "=", "play.track_id")
      .join("artist", "artist.id", "=", "track.artist_id")
      .select(groupBy)
      .count("play.id as playTotal")
      .where("artist.user_id", "=", request.userId)
      .andWhere("track.deleted", "=", false)
      .groupBy([groupBy, "artist.user_id"])
      .then((data) => {
        if (data.length === 0) {
          res.send({ success: true, data: data });
          return;
        }
        const formatted = data.map((item) => {
          return {
            playTotal: parseInt(item.playTotal),
            createdAt: formatMonth(item.concat),
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
        next(error);
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
    .andWhere("track.deleted", "=", false)
    .andWhere("play.created_at", ">", d30)
    .groupBy([groupBy, "artist.user_id"])
    .then((data) => {
      if (data.length === 0) {
        res.send({ success: true, data: data });
        return;
      }
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
      next(error);
    });
});

const get_plays_by_agent_by_account = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
  };

  db.knex("track")
    .join("play", "track.id", "=", "play.track_id")
    .join("artist", "artist.id", "=", "track.artist_id")
    .select(
      db.knex.raw(
        "COALESCE(SPLIT_PART(play.user_agent, '/', 1), 'Unknown') as agent"
      )
    )
    .count("play.id as playTotal")
    .where("artist.user_id", "=", request.userId)
    .andWhere("track.deleted", "=", false)
    .andWhere("play.created_at", ">", d30)
    .groupBy(["artist.user_id", "agent"])
    .then((data) => {
      if (data.length === 0) {
        res.send({ success: true, data: data });
        return;
      }
      res.send({ success: true, data: data });
    })
    .catch((err) => {
      log.error(err);
      const error = formatError(
        500,
        "There was a problem retrieving play agent data"
      );
      next(error);
    });
});

const get_plays_by_tracks = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
  };

  db.knex("track")
    .join("play", "track.id", "=", "play.track_id")
    .join("artist", "artist.id", "=", "track.artist_id")
    .select("track.id as trackId", "track.title as title")
    .count("play.id as playTotal")
    .where("artist.user_id", "=", request.userId)
    .andWhere("track.deleted", "=", false)
    .andWhere("play.created_at", ">", d30)
    .groupBy("trackId")
    .orderBy("playTotal", "desc")
    .then((data) => {
      if (data.length === 0) {
        res.send({ success: true, data: data });
        return;
      }
      const formatted = data.map((item) => {
        return {
          playTotal: parseInt(item.playTotal),
          trackId: item.trackId,
          title: item.title,
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
      next(error);
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
    .andWhere("track.deleted", "=", false)
    .andWhere("play.created_at", ">", d30)
    .groupBy([groupBy, "track.id"])
    // @ts-ignore
    .orderBy(groupBy, "asc")
    .then((data) => {
      if (data.length === 0) {
        res.send({ success: true, data: data });
        return;
      }
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
      next(error);
    });
});

const get_totals_all_time_by_tracks = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
  };

  const playsum = db
    .knex("play")
    .select("track_id")
    .count("id as playtotal")
    .groupBy("track_id")
    .as("playsum");

  db.knex("track")
    .join("artist", "artist.id", "=", "track.artist_id")
    .leftOuterJoin(playsum, "track.id", "=", "playsum.track_id")
    .select(
      "track.id as trackId",
      "track.msat_total as msatTotal",
      "track.title as title",
      db.knex.raw("COALESCE(playtotal,0) as playTotal")
    )
    .where("artist.user_id", "=", request.userId)
    .andWhere("track.deleted", "=", false)
    .orderBy("track.msat_total", "desc")
    .then((data) => {
      if (data.length === 0) {
        res.send({ success: true, data: data });
        return;
      }
      const formatted = data.map((item) => {
        return {
          playTotal: item.playtotal,
          msatTotal: item.msatTotal,
          title: item.title,
          trackId: item.trackId,
        };
      });
      res.send({ success: true, data: formatted });
    })
    .catch((err) => {
      log.error(err);
      const error = formatError(
        500,
        "There was a problem retrieving totals data"
      );
      next(error);
    });
});

function formatMonth(s) {
  const [year, month] = s.split("-");
  return `${year}-${month.padStart(2, "0")}`;
}

export default {
  get_earnings_by_account,
  get_earnings_all_time_by_account,
  get_earnings_all_time_by_account_monthly,
  get_earnings_by_account_daily,
  get_earnings_by_tracks,
  get_earnings_by_tracks_daily,
  get_plays_by_account,
  get_plays_all_time_by_account,
  get_plays_all_time_by_account_monthly,
  get_plays_by_account_daily,
  get_plays_by_agent_by_account,
  get_plays_by_tracks,
  get_plays_by_tracks_daily,
  get_totals_all_time_by_tracks,
};

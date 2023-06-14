const log = require("loglevel");
import db from "../library/db";
const { randomUUID } = require("crypto");
const fs = require("fs");
import multer from "multer";
const Jimp = require("jimp");
const s3Client = require("../library/s3Client");
const format = require("../library/format");
const { default: knex } = require("knex");
const cdnClient = require("../library/cloudfrontClient");
const { getArtistUser } = require("../library/userHelper");

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

const get_artist_by_url = handleErrorAsync(async (req, res, next) => {
  const request = {
    artistUrl: req.params.artistUrl,
    // limit: req.query.limit ? req.query.limit : 10,
    // sortBy: req.body.sortBy
  };

  if (request.artistUrl) {
    db.knex("artist")
      .select(
        "artist.id as id",
        "artist.name as name",
        "artist.bio as bio",
        "artist.twitter as twitter",
        "artist.npub as nostr",
        "artist.instagram as instagram",
        "artist.youtube as youtube",
        "artist.website as website",
        "artist.artwork_url as avatarUrl",
        "artist.verified as verified",
        "artist.updated_at as updateDate"
      )
      .where("artist.artist_url", "=", request.artistUrl)
      .then((data) => {
        // console.log(data)
        res.send(data);
      })
      .catch((err) => {
        log.debug(`Error querying track table in get_artist_by_url: ${err}`);
        next(err);
      });
  }
});

export default {
  get_artist_by_url,
};

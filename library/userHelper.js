import db from "./db";
const log = require("loglevel");
const Sentry = require("@sentry/node");

async function getTrackAccount(userId, trackId) {
  return db
    .knex("track")
    .join("artist", "track.artist_id", "=", "artist.id")
    .join("user", "artist.user_id", "=", "user.id")
    .select("user.id as userId")
    .where("track.id", "=", trackId)
    .first()
    .then((data) => {
      return data.userId == userId;
    })
    .catch((err) => {
      Sentry.captureException(err);
      log.error(`Error finding user from trackId ${err}`);
    });
}

export async function getAlbumAccount(userId, albumId) {
  return db
    .knex("album")
    .join("artist", "album.artist_id", "=", "artist.id")
    .join("user", "artist.user_id", "=", "user.id")
    .select("user.id as userId")
    .where("album.id", "=", albumId)
    .first()
    .then((data) => {
      return data.userId == userId;
    })
    .catch((err) => {
      Sentry.captureException(err);
      log.error(`Error finding user from albumId ${err}`);
    });
}

export async function getPodcastAccount(userId, podcastId) {
  return db
    .knex("podcast")
    .select("podcast.user_id as userId")
    .where("id", "=", podcastId)
    .first()
    .then((data) => {
      // console.log(data);
      return data.userId == userId;
    })
    .catch((err) => {
      Sentry.captureException(err);
      log.error(`Error finding account from podcastId ${err}`);
    });
}

export async function getArtistAccount(userId, artistId) {
  return db
    .knex("artist")
    .select("artist.user_id as userId")
    .where("id", "=", artistId)
    .first()
    .then((data) => {
      // console.log(data);
      return data.userId == userId;
    })
    .catch((err) => {
      Sentry.captureException(err);
      log.error(`Error finding account from artistId ${err}`);
    });
}

async function getCommentUser(commentId) {
  return db
    .knex("comment")
    .select("user_id as userId")
    .where("id", "=", commentId)
    .first()
    .then((data) => {
      // console.log(data)
      return data;
    })
    .catch((err) => {
      Sentry.captureException(err);
      log.error(`Error finding user from commentId ${err}`);
    });
}

async function isPlaylistOwner(userId, playlistId) {
  return db
    .knex("playlist")
    .select("user_id as userId")
    .where("id", "=", playlistId)
    .first()
    .then((data) => {
      // console.log(data);
      return data.userId === userId;
    })
    .catch((err) => {
      Sentry.captureException(err);
      log.error(`Error finding user from playlistId ${err}`);
    });
}

module.exports = {
  getTrackAccount,
  getAlbumAccount,
  getArtistAccount,
  getCommentUser,
  isPlaylistOwner,
};

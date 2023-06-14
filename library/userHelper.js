import db from "./db";
const log = require("loglevel");

async function getUser(trackId) {
  return db
    .knex("track")
    .join("artist", "track.artist_id", "=", "artist.id")
    .join("user", "artist.user_id", "=", "user.id")
    .select("user.id as userId")
    .where("track.id", "=", trackId)
    .first()
    .then((data) => {
      // console.log(data)
      return data;
    })
    .catch((err) => {
      log.error(`Error finding user from trackId ${err}`);
    });
}

async function getAlbumUser(albumId) {
  return db
    .knex("album")
    .join("artist", "album.artist_id", "=", "artist.id")
    .join("user", "artist.user_id", "=", "user.id")
    .select("user.id as userId")
    .where("album.id", "=", albumId)
    .first()
    .then((data) => {
      // console.log(data)
      return data;
    })
    .catch((err) => {
      log.error(`Error finding user from albumId ${err}`);
    });
}

export async function getArtistUser(artistId) {
  return db
    .knex("artist")
    .join("user", "artist.user_id", "=", "user.id")
    .select("user.id as userId")
    .where("artist.id", "=", artistId)
    .first()
    .then((data) => {
      // console.log(data)
      return data;
    })
    .catch((err) => {
      log.error(`Error finding user from artistId ${err}`);
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
      log.error(`Error finding user from playlistId ${err}`);
    });
}

module.exports = {
  getUser,
  getAlbumUser,
  getArtistUser,
  getCommentUser,
  isPlaylistOwner,
};

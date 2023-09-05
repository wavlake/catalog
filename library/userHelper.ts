import db from "./db";
const log = require("loglevel");
const Sentry = require("@sentry/node");

export type SplitContentTypes = "track" | "episode" | "podcast" | "album";

export async function isContentOwner(
  userId: string,
  contentId: string,
  contentType: SplitContentTypes
): Promise<boolean> {
  switch (contentType) {
    case "track":
      return isTrackOwner(userId, contentId);
    case "episode":
      return isEpisodeOwner(userId, contentId);
    case "album":
      return isAlbumOwner(userId, contentId);
    case "podcast":
      return isPodcastOwner(userId, contentId);

    default:
      return false;
  }
}

export async function isTrackOwner(
  userId: string,
  trackId: string
): Promise<boolean> {
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
      return false;
    });
}

export async function isEpisodeOwner(
  userId: string,
  episodeId: string
): Promise<boolean> {
  return db
    .knex("episode")
    .join("podcast", "episode.podcast_id", "=", "podcast.id")
    .join("user", "podcast.user_id", "=", "user.id")
    .select("user.id as userId")
    .where("episode.id", "=", episodeId)
    .first()
    .then((data) => {
      return data.userId == userId;
    })
    .catch((err) => {
      Sentry.captureException(err);
      log.error(`Error finding user from episodeId ${err}`);
      return false;
    });
}

export async function isAlbumOwner(
  userId: string,
  albumId: string
): Promise<boolean> {
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
      return false;
    });
}

export async function isPodcastOwner(
  userId: string,
  podcastId: string
): Promise<boolean> {
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
      return false;
    });
}

export async function isArtistOwner(
  userId: string,
  artistId: string
): Promise<boolean> {
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
      return false;
    });
}

export async function getCommentUser(commentId: string): Promise<any> {
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
      return undefined;
    });
}

export async function isPlaylistOwner(
  userId: string,
  playlistId: string
): Promise<boolean> {
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
      return false;
    });
}

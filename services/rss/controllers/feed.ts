import db from "@library/db";
const log = require("loglevel");
const { validate } = require("uuid");
const {
  buildAlbumFeed,
  buildArtistFeed,
  buildPodcastFeed,
} = require("../library/feedBuilder");

// Error handling
// Ref: https://stackoverflow.com/questions/43356705/node-js-express-error-handling-middleware-with-router
const handleErrorAsync = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    next(error);
  }
};

exports.getArtistFeed = handleErrorAsync(async (req, res, next) => {
  const { feedId } = req.params;

  const validUuid = validate(feedId);

  if (!validUuid) {
    res.status(400).send("Invalid id");
    return;
  }

  const albums = await db
    .knex("artist")
    .join("album", "artist.id", "=", "album.artist_id")
    .select(
      "artist.id as artistId",
      "artist.name as artist",
      "artist.artist_url as artistUrl",
      "artist.bio as bio",
      "artist.artwork_url as artworkUrl",
      "album.id as albumId",
      "album.title as albumTitle",
      "album.is_draft as isDraft",
      "album.deleted as deleted"
    )
    .where("artist.id", "=", feedId)
    .andWhere("album.deleted", false)
    .andWhere("album.is_draft", false)
    .catch((err) => {
      log.debug(`Error querying albums table to generate artist feed: ${err}`);
      return [];
    });

  if (albums.length > 0) {
    const feed = await buildArtistFeed(albums);
    res.send(feed);
  } else {
    res.status(404).send("No such feed");
  }
});

exports.getMusicFeed = handleErrorAsync(async (req, res, next) => {
  const { feedId } = req.params;

  const validUuid = validate(feedId);

  if (!validUuid) {
    res.status(400).send("Invalid id");
    return;
  }

  const tracks = await db
    .knex("track")
    .join("artist", "track.artist_id", "=", "artist.id")
    .join("album", "track.album_id", "=", "album.id")
    .leftOuterJoin("music_genre", "album.genre_id", "=", "music_genre.id")
    .leftOuterJoin(
      "music_subgenre",
      "album.subgenre_id",
      "=",
      "music_subgenre.id"
    )
    .select(
      "album.id as albumId",
      "album.title as albumTitle",
      "album.artwork_url as artwork",
      "album.description as description",
      "track.id as trackId",
      "track.title as trackTitle",
      "artist.name as artist",
      "artist.id as artistId",
      "artist.artist_url as artistUrl",
      "track.live_url as liveUrl",
      "track.order as order",
      "track.size as size",
      "track.duration as duration",
      "track.created_at as createDate",
      "track.deleted as deleted",
      "track.is_draft as isDraft",
      "track.is_processing as isProcessing",
      "track.is_explicit as isExplicit",
      "music_genre.name as genre",
      "music_subgenre.name as subgenre"
    )
    .where("track.deleted", false)
    .andWhere("track.album_id", "=", feedId)
    .andWhere("track.is_draft", false)
    .andWhere("track.is_processing", false)
    .catch((err) => {
      log.debug(`Error querying tracks table to generate music feed: ${err}`);
      return [];
    });

  if (tracks.length > 0) {
    const feed = await buildAlbumFeed(tracks);
    res.send(feed);
  } else {
    res.status(404).send("No such feed");
  }
});

exports.getPodcastFeed = handleErrorAsync(async (req, res, next) => {
  const { feedId } = req.params;

  const validUuid = validate(feedId);

  if (!validUuid) {
    res.status(400).send("Invalid id");
    return;
  }
  const episodes = await db
    .knex("podcast")
    .join("episode", "podcast.id", "=", "episode.podcast_id")
    .leftOuterJoin(
      "podcast_category",
      "podcast.primary_category_id",
      "=",
      "podcast_category.id"
    )
    .leftOuterJoin(
      "podcast_subcategory",
      "podcast.primary_subcategory_id",
      "=",
      "podcast_subcategory.id"
    )
    .leftOuterJoin(
      "podcast_category as secondary_category",
      "podcast.secondary_category_id",
      "=",
      "secondary_category.id"
    )
    .leftOuterJoin(
      "podcast_subcategory as secondary_subcategory",
      "podcast.secondary_subcategory_id",
      "=",
      "secondary_subcategory.id"
    )
    .select(
      "podcast.id as podcastId",
      "podcast.name as author",
      "podcast.name as title",
      "podcast.artwork_url as artwork",
      "podcast.podcast_url as artistUrl",
      "podcast.description as description",
      "episode.id as episodeId",
      "episode.title as episodeTitle",
      "episode.live_url as liveUrl",
      "episode.order as order",
      "episode.size as size",
      "episode.description as episodeDescription",
      "episode.duration as duration",
      "episode.created_at as createDate",
      "episode.deleted as deleted",
      "episode.is_draft as isDraft",
      "episode.is_processing as isProcessing",
      "podcast_category.name as primaryCategory",
      "podcast_subcategory.name as primarySubcategory",
      "secondary_category.name as secondaryCategory",
      "secondary_subcategory.name as secondarySubcategory"
    )
    .where("episode.deleted", false)
    .andWhere("podcast.id", "=", feedId)
    .andWhere("episode.is_draft", false)
    .andWhere("episode.is_processing", false)
    .catch((err) => {
      log.debug(`Error querying podcast table to generate feed: ${err}`);
      return [];
    });

  if (episodes.length > 0) {
    const feed = await buildPodcastFeed(episodes);
    res.send(feed);
  } else {
    // no episodes found
    res.status(404).send("No such feed");
  }
});

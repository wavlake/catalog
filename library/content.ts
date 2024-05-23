import db from "./db";
const { validate } = require("uuid");
const log = require("loglevel");
import { SplitContentTypes } from "./userHelper";

export async function getType(
  contentId: string
): Promise<SplitContentTypes | null> {
  const validUuid = validate(contentId);

  if (!validUuid) {
    log.debug("Invalid id: ", contentId);
    return null;
  }

  const track = await db
    .knex("track")
    .select("id")
    .where("track.id", "=", contentId)
    .then((data) => {
      return data.length > 0;
    });

  if (track) {
    return "track";
  }

  const episode = await db
    .knex("episode")
    .select("id")
    .where("episode.id", "=", contentId)
    .then((data) => {
      return data.length > 0;
    });

  if (episode) {
    return "episode";
  }

  const podcast = await db
    .knex("podcast")
    .select("id")
    .where("podcast.id", "=", contentId)
    .then((data) => {
      return data.length > 0;
    });

  if (podcast) {
    return "podcast";
  }

  const album = await db
    .knex("album")
    .select("id")
    .where("album.id", "=", contentId)
    .then((data) => {
      return data.length > 0;
    });

  if (album) {
    return "album";
  }

  const artist = await db
    .knex("artist")
    .select("id")
    .where("artist.id", "=", contentId)
    .then((data) => {
      return data.length > 0;
    });

  if (artist) {
    return "artist";
  }

  return null;
}

export const getParentContentTypeAndId = async (contentId) => {
  const album = await db
    .knex("track")
    .select("album_id")
    .where("track.id", "=", contentId)
    .then((data) => {
      if (!data) {
        return null;
      }
      return data[0].album_id;
    });

  if (album) {
    return { contentType: "album", parentId: album };
  }

  const podcast = await db
    .knex("episode")
    .select("podcast_id")
    .where("episode.id", "=", contentId)
    .then((data) => {
      if (!data) {
        return null;
      }
      return data[0].podcast_id;
    });

  if (podcast) {
    return { contentType: "podcast", parentId: podcast };
  }

  return null;
};

export const getContentFromId = async (contentId) => {
  const validUuid = validate(contentId);

  if (!validUuid) {
    log.debug("Invalid id: ", contentId);
    return;
  }

  const contentType = await getType(contentId);

  if (!contentType) {
    return null;
  }

  // return all data for the content
  const content = await db
    .knex(contentType)
    .select("*")
    .where("id", "=", contentId)
    .andWhere("deleted", "=", false)
    .first();

  return content;
};

export const getContentFromEventId = async (eventId) => {
  const { content_id } = await db
    // the event_track table used to be only for tracks, but now it's for all content types
    .knex("event_track")
    // track_id is really content_id (tracks/episodes/podcasts/album)
    .select("track_id as content_id")
    .where("event_id", "=", eventId)
    .first();

  const content = await getContentFromId(content_id);

  return content;
};

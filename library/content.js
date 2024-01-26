import db from "./db";
const { validate } = require("uuid");
const log = require("loglevel");

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

export const getType = async (contentId) => {
  const types = ["track", "episode", "podcast", "album", "artist"];
  const validUuid = validate(contentId);

  if (!validUuid) {
    log.debug("Invalid id: ", contentId);
    return;
  }

  for (const type of types) {
    const exists = await db
      .knex(type)
      .select("id")
      .where(`${type}.id`, "=", contentId)
      .then((data) => data.length > 0)
      .catch((err) => {
        log.error(`Error finding content from contentId ${err}`);
      });
    if (exists) {
      return type;
    }
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
    .first();

  return content;
};

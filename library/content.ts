import db from "./db";
const { validate } = require("uuid");
const log = require("loglevel");
import { SplitContentTypes } from "./userHelper";
import prisma from "../prisma/client";
import { addOP3URLPrefix } from "./op3";

export async function getContentInfoFromId(contentId: string) {
  const type = await getType(contentId);

  if (type != "track") {
    log.info("TODO: This function currently only supports track info.");
    return null;
  }

  const contentInfo = await prisma.trackInfo.findUnique({
    where: { id: contentId },
  });

  if (!contentInfo) {
    log.info("No content info found for track: ", contentId);
    return null;
  }

  contentInfo.liveUrl = addOP3URLPrefix({
    url: contentInfo.liveUrl,
    albumId: contentInfo.albumId,
  });

  return contentInfo;
}

export async function getType(
  contentId: string
): Promise<SplitContentTypes | null> {
  const validUuid = validate(contentId);

  if (!validUuid) {
    log.info("Invalid id: ", contentId);
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
      if (!data || data.length === 0) {
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
      if (!data || data.length === 0) {
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
    log.info("Invalid id: ", contentId);
    return;
  }

  const contentType = await getType(contentId);

  if (!contentType) {
    return null;
  }

  // return all data for the content
  const content =
    contentType === "track"
      ? await db
          .knex("track_info")
          .select("*")
          .where("id", "=", contentId)
          .first()
      : await db
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

export const getReleaseTitle = async (contentId: string, type: string) => {
  if (!contentId || !validate(contentId) || !type) {
    return null;
  }
  if (type !== "album" && type !== "podcast") {
    return null;
  }

  const releaseTitle = await db
    .knex(type)
    .select(`${type === "album" ? "title" : "name"} as title`)
    .where("id", "=", contentId)
    .then((data) => {
      if (!data || data.length === 0) {
        return null;
      }
      return data[0].title;
    });

  return releaseTitle;
};

import db from "./db";
import { SplitContentTypes } from "./userHelper";

export async function getType(
  contentId: string
): Promise<SplitContentTypes | null> {
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

  return null;
}

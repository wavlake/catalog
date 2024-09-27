const log = require("loglevel");
import prisma from "../prisma/client";
const asyncHandler = require("express-async-handler");
import db from "../library/db";
const { validate } = require("uuid");

const get_music_genre_list = asyncHandler(async (req, res, next) => {
  const genres = await prisma.musicGenre.findMany({
    select: {
      id: true,
      name: true,
    },
  });

  const albumCount = await prisma.album.groupBy({
    by: ["genreId"],
    _count: {
      genreId: true,
    },
    where: {
      track: { some: { deleted: false } },
    },
  });

  const genresWithCount = genres.map((genre) => {
    const count = albumCount.find((item) => item.genreId === genre.id);
    return { ...genre, count: count?._count?.genreId || 0 };
  });

  res.send({ success: true, data: genresWithCount });
});

const get_music_subgenre_list = asyncHandler(async (req, res, next) => {
  const { genreId } = req.params;

  const genres = await prisma.musicSubgenre.findMany({
    where: {
      genreId: parseInt(genreId),
    },
    select: {
      id: true,
      name: true,
    },
  });

  res.send({ success: true, data: genres });
});

const get_podcast_category_list = asyncHandler(async (req, res, next) => {
  const genres = await prisma.podcastCategory.findMany({
    select: {
      id: true,
      name: true,
    },
  });

  res.send({ success: true, data: genres });
});

const get_podcast_subcategory_list = asyncHandler(async (req, res, next) => {
  const { categoryId } = req.params;

  const genres = await prisma.podcastSubcategory.findMany({
    where: {
      category_id: parseInt(categoryId),
    },
    select: {
      id: true,
      name: true,
    },
  });

  res.send({ success: true, data: genres });
});

const get_meta_content_by_guids = asyncHandler(async (req, res, next) => {
  let { guid } = req.query;

  // If only one guid, convert to array
  if (!Array.isArray(guid)) {
    guid = [guid];
  }

  // Validate guids
  if (guid) {
    const guidsValid = guid.every((x) => {
      return validate(x);
    });

    if (!guidsValid) {
      return res.status(400).send({ success: false, message: "Invalid GUID" });
    }
  }

  const tracks = await db
    .knex("track")
    .join("album", "track.album_id", "album.id")
    .join("artist", "album.artist_id", "artist.id")
    .select(
      "track.id as contentId",
      "track.title as contentTitle",
      db.knex.raw(`'track' as "contentType"`),
      db.knex.raw(`ARRAY_AGG("album"."artwork_url") as "contentArtwork"`),
      "artist.name as artist",
      "album.title as parentContentTitle",
      "album.id as parentContentId"
    )
    .whereIn("track.id", guid)
    .groupBy("track.id", "artist.name", "album.title", "album.id");

  // TODO: Add album and artist lookups

  res.send({ success: true, data: tracks });
});

export default {
  get_music_genre_list,
  get_music_subgenre_list,
  get_podcast_category_list,
  get_podcast_subcategory_list,
  get_meta_content_by_guids,
};

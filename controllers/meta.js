const log = require("loglevel");
import prisma from "../prisma/client";
const asyncHandler = require("express-async-handler");
import { formatError } from "../library/errors";

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

export default { get_music_genre_list, get_music_subgenre_list };

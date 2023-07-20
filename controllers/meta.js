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

  res.send({ success: true, data: genres });
});

const get_music_subgenre_list = asyncHandler(async (req, res, next) => {
  const { genreId } = req.params;

  console.log(genreId);

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

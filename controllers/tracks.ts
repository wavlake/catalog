import prisma from "../prisma/client";

// Error handling
// Ref: https://stackoverflow.com/questions/43356705/node-js-express-error-handling-middleware-with-router
const handleErrorAsync = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    next(error);
  }
};

// Top 40
const get_index_top = handleErrorAsync(async (req, res, next) => {
  const request = {
    limit: req.query.limit ? req.query.limit : 41,
  };

  const tracks = await prisma.trackInfo.findMany({
    where: { msat_total_30_days: { gt: 0 } },
    orderBy: { msat_total_30_days: "desc" },
    take: request.limit,
  });

  res.json(tracks);
});

const get_track = handleErrorAsync(async (req, res, next) => {
  const request = {
    trackId: req.params.trackId,
  };

  const track = await prisma.trackInfo.findFirstOrThrow({
    where: { id: request.trackId },
  });

  res.json(track);
});

export default {
  get_index_top,
  get_track,
};

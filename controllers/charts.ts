import prisma from "../prisma/client";
import db from "../library/db";
const log = require("loglevel");
const asyncHandler = require("express-async-handler");

// Top 40
const get_top_forty = asyncHandler(async (req, res, next) => {
  const request = {
    limit: req.query.limit ? req.query.limit : 41,
  };

  const tracks = await prisma.trackInfo.findMany({
    where: { msatTotal30Days: { gt: 0 } },
    orderBy: { msatTotal30Days: "desc" },
    take: request.limit,
  });

  res.json({ success: true, data: tracks });
});

export default {
  get_top_forty,
};

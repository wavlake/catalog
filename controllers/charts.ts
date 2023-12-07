import prisma from "../prisma/client";
import db from "../library/db";
const log = require("loglevel");
const asyncHandler = require("express-async-handler");

// Top 40
const get_top_forty = asyncHandler(async (req, res, next) => {
  const { limit, phase }: { limit: number; phase: string } = {
    limit: req.query.limit ? parseInt(req.query.limit) : 50,
    phase: req.query.phase ? req.query.phase : "week", // week by default
  };

  phase === "day" || phase === "week" || phase === "month"
    ? null
    : res.json({
        success: false,
        error: "Invalid phase, must be one of: day, week, month",
      });

  if (phase === "day") {
    const tracks = await prisma.trackInfo.findMany({
      where: { msatTotal1Days: { gt: 0 } },
      orderBy: { msatTotal1Days: "desc" },
      take: limit,
    });
    res.json({ success: true, data: tracks });
  } else if (phase === "month") {
    const tracks = await prisma.trackInfo.findMany({
      where: { msatTotal30Days: { gt: 0 } },
      orderBy: { msatTotal30Days: "desc" },
      take: limit,
    });
    res.json({ success: true, data: tracks });
  } else if (phase === "week") {
    const tracks = await prisma.trackInfo.findMany({
      where: { msatTotal7Days: { gt: 0 } },
      orderBy: { msatTotal7Days: "desc" },
      take: limit,
    });
    res.json({ success: true, data: tracks });
  }
});

export default {
  get_top_forty,
};

import log from "../library/winston";
import asyncHandler from "express-async-handler";
import Sentry from "@sentry/node";
import { validate } from "uuid";
import { getContentStats, OP3CombinedData } from "../library/op3";
import {
  getEarningsNumbers,
  getTopSupporters,
  getTopContent,
  getLifetimeEarnings,
  getContentMonthlyEarnings,
} from "../library/analytics";
import { ResponseObject } from "../types/catalogApi";

type Downloads = {
  earningsMsat: number;
  uniqueAmpUsers: number;
} & OP3CombinedData;

// Get the last 30 days of download stats for a content item
// plus earnings for that item
const get_downloads = asyncHandler<{}, ResponseObject<Downloads>, any>(
  async (req, res, next) => {
    const userId = req["uid"];
    const contentId = req.query.contentId;
    if (typeof contentId !== "string" || !validate(contentId)) {
      res.status(400).json({ success: false, error: "contentId is required" });
      return;
    }

    const startDate = req.query.startDate as string;
    // check if startDate is a valid ISO date
    if (startDate && !Date.parse(startDate)) {
      res.status(400).json({
        success: false,
        error: "startDate must be a valid ISO date string (yyyy-mm-dd)",
      });
      return;
    }
    const response = await getContentStats(contentId, startDate);

    const earnings = await getContentMonthlyEarnings(userId, contentId);
    res.json({
      success: true,
      data: {
        rows: response.rows ?? [],
        count: response.count ?? 0,
        statsPageUrl: response.statsPageUrl ?? "",
        releaseTitle: response.releaseTitle ?? "",
        earningsMsat: earnings.earnings ?? 0,
        uniqueAmpUsers: earnings.uniqueAmpUsers ?? 0,
      },
    });
  }
);

const get_earnings = asyncHandler(async (req, res, next) => {
  const userId = req["uid"];

  const earningsNumbers = await getEarningsNumbers(userId);
  const topSupporters = await getTopSupporters(userId);
  const topContent = await getTopContent(userId);
  const msatEarningsLifetime = await getLifetimeEarnings(userId);
  res.json({
    success: true,
    data: {
      ...earningsNumbers,
      msatEarningsLifetime,
      topSupporters,
      topContent,
    },
  });
});

export default {
  get_downloads,
  get_earnings,
};

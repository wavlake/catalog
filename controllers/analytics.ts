const log = require("loglevel");
const asyncHandler = require("express-async-handler");
const Sentry = require("@sentry/node");
import { getContentStats } from "../library/op3";
import {
  getEarningsNumbers,
  getTopSupporters,
  getTopContent,
} from "../library/analytics";

// Get the last 30 days of download stats for a content item
const get_downloads = asyncHandler(async (req, res, next) => {
  const contentId = req.query.contentId;
  const startDate = req.query.startDate;
  const response = await getContentStats(contentId, startDate);
  res.json({ success: true, data: response });
});

const get_earnings = asyncHandler(async (req, res, next) => {
  const userId = req["uid"];

  const earningsNumbers = await getEarningsNumbers(userId);
  const topSupporters = await getTopSupporters(userId);
  const topContent = await getTopContent(userId);
  res.json({
    success: true,
    data: {
      ...earningsNumbers,
      topSupporters,
      topContent,
    },
  });
});

export default {
  get_downloads,
  get_earnings,
};

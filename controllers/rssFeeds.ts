import db from "../library/db";
import asyncHandler from "express-async-handler";

const get_rss_feeds = asyncHandler(async (req, res, next) => {
  try {
    const feeds = await db.knex("feeds").limit(10);

    res.send({
      success: true,
      data: feeds,
    });
  } catch (err) {
    next(err);
  }
});

export default { get_rss_feeds };

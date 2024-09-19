import log, { LogLevelDesc } from "loglevel";
log.setLevel((process.env.LOG_LEVEL as LogLevelDesc) || "info");
import asyncHandler from "express-async-handler";
import prisma from "@prismalocal/client";
import db from "@library/db";
import core from "express-serve-static-core";

const MAX_DAILY_USER_REWARDS = 200000;

async function isRewardActive(promoRewardId: string): Promise<boolean> {
  // Set filters to 65 seconds ago and 55 seconds ago
  const startDate = new Date(Date.now() - 65000);
  const endDate = new Date(Date.now() - 55000);
  const promoReward = await db
    .knex("promo_reward")
    .where("id", promoRewardId)
    .andWhere("is_pending", true)
    .andWhere("created_at", ">", startDate)
    .andWhere("created_at", "<", endDate)
    .first();

  if (!promoReward) {
    return false;
  }
  return true;
}

async function isPromoActive(promoId: string): Promise<boolean> {
  const promo = await db
    .knex("promo")
    .where("id", promoId)
    .andWhere("is_active", true)
    .andWhere("is_pending", false)
    .andWhere("is_paid", true)
    .first();
  if (!promo) {
    return false;
  }

  // Set filter to 90 seconds ago
  const dateFilter = new Date(Date.now() - 90000);
  const totalSettledRewards = await db
    .knex("promo_reward")
    .sum("msat_amount as total")
    .where("promo_id", promoId)
    .andWhere("is_pending", false)
    .first();

  const totalPendingRewards = await db
    .knex("promo_reward")
    .sum("msat_amount as total")
    .where("promo_id", promoId)
    .andWhere("created_at", ">", dateFilter)
    .first();

  if (
    parseInt(totalSettledRewards.total) + parseInt(totalPendingRewards.total) >=
    promo.msat_budget
  ) {
    return false;
  }

  return true;
}

async function isUserEligibleForReward(
  userId: string,
  promoId: string
): Promise<boolean> {
  // Set datetime to 59 seconds ago
  const now = new Date(Date.now() - 59000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  try {
    // User has not been rewarded in the last minute
    const userLastReward = await db
      .knex("promo_reward")
      .select("user_id")
      .max("created_at as last_reward_created_at")
      .where("user_id", userId)
      .groupBy("user_id")
      .first();

    if (userLastReward && userLastReward.last_reward_created_at > now) {
      log.debug("User has been rewarded in the last minute");
      return false;
    }

    // User has not reached the daily reward limit
    const userDailyTotalRewards = await db
      .knex("promo_reward")
      .where("user_id", userId)
      .sum("msat_amount as total")
      .andWhere("created_at", ">", today)
      .andWhere("is_pending", false)
      .groupBy("user_id")
      .first();

    if (
      userDailyTotalRewards &&
      userDailyTotalRewards.total >= MAX_DAILY_USER_REWARDS
    ) {
      log.debug("User has reached the daily reward limit");
      return false;
    }

    // User has not reached the daily content reward limit
    const userDailyContentRewards = await db
      .knex("promo_reward")
      .join("promo", "promo_reward.promo_id", "promo.id")
      .select(
        "promo.id",
        "promo.msat_payout_amount as msat_payout_amount",
        "promo.content_type as content_type",
        "promo.content_id as content_id"
      )
      .sum("msat_amount as total")
      .where("promo.id", promoId)
      .andWhere("promo_reward.user_id", userId)
      .andWhere("promo_reward.created_at", ">", today)
      .andWhere("promo_reward.is_pending", false)
      .groupBy("promo.id", "promo.msat_payout_amount", "promo.content_type")
      .first();

    // In case the user has not been rewarded for any content today
    if (!userDailyContentRewards) {
      return true;
    }

    const contentDuration = await db
      .knex(userDailyContentRewards.content_type)
      .select("duration")
      .where("id", userDailyContentRewards.content_id)
      .first();

    if (
      userDailyContentRewards &&
      parseInt(userDailyContentRewards.total) >=
        (userDailyContentRewards.msat_payout_amount *
          contentDuration.duration) /
          60
    ) {
      log.debug("User has reached the daily content reward limit");
      return false;
    }

    return true;
  } catch (error) {
    log.error(error);
    return false;
  }
}

const createPromoReward = asyncHandler<core.ParamsDictionary, any, any>(
  async (req, res, next) => {
    const { promoId } = req.body;
    const userId = req["uid"];

    // Validate
    if (!promoId) {
      res.status(400).json({ success: false, message: "promoId required" });
      return;
    }

    const userIsEligible = await isUserEligibleForReward(userId, promoId);
    if (!userIsEligible) {
      res
        .status(400)
        .json({ success: false, message: "User not currently eligible" });
      return;
    }
    // Promo exists, is active, and has budget
    const promoIsActive = await isPromoActive(promoId);

    if (!promoIsActive) {
      res.status(400).json({ success: false, message: "Promo not active" });
      return;
    }

    // Create promo reward record
    const promo = await db
      .knex("promo")
      .select("msat_payout_amount")
      .where("id", promoId)
      .first();

    const promoReward = await prisma.promoReward.create({
      data: {
        userId: userId,
        promoId: promoId,
        msatAmount: promo.msat_payout_amount,
        isPending: true,
      },
    });

    res.status(200).json({
      success: true,
      data: promoReward,
      message: "Promo reward created",
    });
  }
);

const updatePromoReward = asyncHandler<core.ParamsDictionary, any, any>(
  async (req, res, next) => {
    const { promoRewardId } = req.body;
    const userId = req["uid"];

    // Validate
    if (!promoRewardId) {
      res.status(400).json({ success: false, message: "Invalid promo reward" });
      return;
    }

    const promoReward = await db
      .knex("promo_reward")
      .select("promo_id")
      .where("id", promoRewardId)
      .andWhere("is_pending", true)
      .first();

    if (!promoReward) {
      res
        .status(400)
        .json({ success: false, message: "Promo reward not found" });
      return;
    }

    const rewardIsActive = await isRewardActive(promoRewardId);
    if (!rewardIsActive) {
      res
        .status(400)
        .json({ success: false, message: "Reward is not active or expired" });
      return;
    }

    // Validate promo
    const promoIsActive = await isPromoActive(promoReward.promo_id);
    if (!promoIsActive) {
      res.status(400).json({ success: false, message: "Promo not active" });
      return;
    }

    const promo = await db
      .knex("promo")
      .where("id", promoReward.promo_id)
      .first();

    // Update promo reward record and increment user balance
    const trx = await db.knex.transaction();
    await trx("promo_reward")
      .update({ is_pending: false, updated_at: db.knex.fn.now() })
      .where("id", promoRewardId);

    await trx("user")
      .increment("msat_balance", promo.msat_payout_amount)
      .update({ updated_at: db.knex.fn.now() })
      .where("id", userId);

    await trx.commit().catch((error) => {
      log.error(error);
      trx.rollback();
      res
        .status(500)
        .json({ success: false, message: "Error updating promo reward" });
      return;
    });

    res.status(200).json({ success: true, message: "Promo reward updated" });
  }
);

export default { createPromoReward, updatePromoReward };

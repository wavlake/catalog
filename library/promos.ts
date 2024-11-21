import log, { LogLevelDesc } from "loglevel";
log.setLevel((process.env.LOG_LEVEL as LogLevelDesc) || "info");
import db from "./db";
import prisma from "../prisma/client";

const MAX_DAILY_USER_REWARDS = 500000;
export const EARNING_INTERVAL = 60; // seconds;

export const identifyActivePromosWithBudgetRemaining = async (): Promise<
  any[]
> => {
  const activePromos = await db
    .knex("promo")
    .select(
      "id",
      "msat_budget as msatBudget",
      "msat_payout_amount as msatPayoutAmount",
      "content_id as contentId",
      "content_type as contentType"
    )
    .where("is_active", true)
    .andWhere("is_pending", false)
    .andWhere("is_paid", true);

  if (activePromos.length === 0) {
    return [];
  }

  const activePromosRewardTotals = await db
    .knex("promo_reward")
    .select("promo_id")
    .sum("msat_amount as msatTotal")
    .whereIn(
      "promo_id",
      activePromos.map((promo) => promo.id)
    )
    .andWhere("is_pending", false)
    .groupBy("promo_id");

  return activePromos.filter(async (promo) => {
    const promoRewardTotal = activePromosRewardTotals.find(
      (total) => total.promo_id === promo.id
    ).msatBudget;
    return promo.msatBudget > promoRewardTotal;
  });
};

export const identifyPromosWhereUserEarnedToday = async (
  accountId: string
): Promise<any[]> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Set to start of day

  const userPromos = await db
    .knex("promo_reward")
    .join("promo", "promo_reward.promo_id", "promo.id")
    .select(
      "promo.id as id",
      "promo.msat_budget as msatBudget",
      "promo.msat_payout_amount as msatPayoutAmount",
      "promo.content_id as contentId",
      "promo.content_type as contentType"
    )
    .where("promo_reward.user_id", accountId)
    .andWhere("promo_reward.created_at", ">=", today)
    .andWhere("promo_reward.is_pending", false)
    .groupBy(
      "promo.id",
      "promo.msat_payout_amount",
      "promo.content_id",
      "promo.content_type"
    );

  return userPromos;
};

async function deactivatePromo(promoId: number) {
  const promo = await db.knex("promo").where("id", promoId).first();
  if (!promo) {
    return;
  }

  const totalSettledRewards = await getTotalSettledRewards(promoId);

  if (
    // Deactivate promo if settled rewards exceed budget
    totalSettledRewards === promo.msat_budget ||
    // Or if settled rewards plus next minimum payout exceed budget
    totalSettledRewards + promo.msat_payout_amount >= promo.msat_budget
  ) {
    await db
      .knex("promo")
      .update({ is_active: false, updated_at: db.knex.fn.now() })
      .where("id", promoId);
    return;
  }
  return;
}

const getTotalSettledRewards = async (promoId: number): Promise<number> => {
  const query = await db
    .knex("promo_reward")
    .sum("msat_amount as total")
    .where("promo_id", promoId)
    .andWhere("is_pending", false)
    .first();

  if (!query.total) {
    return 0;
  }
  return parseInt(query.total);
};

const getContentDuration = async (
  contentType: string,
  contentId: string
): Promise<number> => {
  const content = await db
    .knex(contentType)
    .select("duration")
    .where("id", contentId)
    .first();
  if (!content) {
    return null;
  }
  return content.duration;
};

export const isPromoActive = async (
  promoId: number,
  msatBudget: number
): Promise<boolean> => {
  const totalSettledRewards = await getTotalSettledRewards(promoId);

  if (totalSettledRewards >= msatBudget) {
    // Deactivate promo if settled rewards exceed budget
    await deactivatePromo(promoId);
    return false;
  }

  return true;
};

export const isUserEligibleForPromo = async (
  userId: string,
  ip: string,
  promoId: number
) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const userDailyContentRewards = await db
    .knex("promo_reward")
    .join("promo", "promo_reward.promo_id", "promo.id")
    .select(
      "promo.id",
      "promo.msat_payout_amount as msat_payout_amount",
      "promo.content_type as content_type",
      "promo.content_id as content_id",
      "promo_reward.user_id as user_id"
    )
    .sum("msat_amount as total")
    .where({ "promo.id": promoId, "promo_reward.user_id": userId })
    .andWhere("promo_reward.created_at", ">", today)
    .andWhere("promo_reward.is_pending", false)
    .groupBy(
      "promo.id",
      "promo.msat_payout_amount",
      "promo.content_type",
      "promo.content_id",
      "promo_reward.user_id"
    )
    .first();

  // In case the user has not been rewarded for any content today
  if (!userDailyContentRewards) {
    return true;
  }

  const ipDailyContentRewards = ip
    ? await db
        .knex("promo_reward")
        .join("promo", "promo_reward.promo_id", "promo.id")
        .select(
          "promo.id",
          "promo.msat_payout_amount as msat_payout_amount",
          "promo.content_type as content_type",
          "promo.content_id as content_id",
          "promo_reward.ip as ip"
        )
        .sum("msat_amount as total")
        .where({ "promo.id": promoId, "promo_reward.ip": ip })
        .andWhere("promo_reward.created_at", ">", today)
        .andWhere("promo_reward.is_pending", false)
        .groupBy(
          "promo.id",
          "promo.msat_payout_amount",
          "promo.content_type",
          "promo.content_id",
          "promo_reward.ip"
        )
        .first()
    : null;

  // In case the ip has not been rewarded for any content today
  if (!ipDailyContentRewards) {
    return true;
  }

  const contentDuration = await getContentDuration(
    userDailyContentRewards.content_type,
    userDailyContentRewards.content_id
  );

  const durationRounded = Math.floor(contentDuration / EARNING_INTERVAL);

  if (
    userDailyContentRewards &&
    parseInt(userDailyContentRewards.total) >=
      userDailyContentRewards.msat_payout_amount * durationRounded
  ) {
    log.debug("User has reached the daily content reward limit");
    return false;
  }

  if (
    ipDailyContentRewards &&
    parseInt(ipDailyContentRewards.total) >=
      ipDailyContentRewards.msat_payout_amount * durationRounded
  ) {
    log.debug("IP has reached the daily content reward limit");
    return false;
  }
  return true;
};

export const isUserEligibleForReward = async (
  userId: string,
  promoId: number,
  ip: string,
  ignoreTime = false
): Promise<boolean> => {
  // Set datetime to 58 seconds ago
  const now = new Date(Date.now() - 58000);
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

    if (
      !ignoreTime &&
      userLastReward &&
      userLastReward.last_reward_created_at > now
    ) {
      log.debug("User has been rewarded in the last minute");
      return false;
    }

    // IP has not been rewarded in the last minute
    const ipLastReward = ip
      ? await db
          .knex("promo_reward")
          .select("ip")
          .max("created_at as last_reward_created_at")
          .where("user_id", ip)
          .groupBy("ip")
          .first()
      : null;

    if (
      !ignoreTime &&
      ipLastReward &&
      ipLastReward.last_reward_created_at > now
    ) {
      log.debug("IP has been rewarded in the last minute");
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

    // IP has not reached the daily reward limit
    const ipDailyTotalRewards = ip
      ? await db
          .knex("promo_reward")
          .where("ip", ip)
          .sum("msat_amount as total")
          .andWhere("created_at", ">", today)
          .andWhere("is_pending", false)
          .groupBy("ip")
          .first()
      : null;

    if (
      ipDailyTotalRewards &&
      ipDailyTotalRewards.total >= MAX_DAILY_USER_REWARDS
    ) {
      log.debug("IP has reached the daily reward limit");
      return false;
    }

    // User has not reached the daily content reward limit
    const userIsEligibleForPromo = await isUserEligibleForPromo(
      userId,
      ip,
      promoId
    );

    if (!userIsEligibleForPromo) {
      log.debug("User has reached the daily content reward limit");
      return false;
    }

    return true;
  } catch (error) {
    log.error(error);
    return false;
  }
};

export const getPromoByContentId = async (contentId: string): Promise<any> => {
  const promo = await prisma.promo.findFirst({
    select: {
      id: true,
      msatBudget: true,
      msatPayoutAmount: true,
      contentId: true,
      contentType: true,
      isActive: true,
    },
    where: {
      contentId: contentId,
      isPending: false,
      isPaid: true,
    },
  });

  if (!promo) {
    return null;
  }

  const isActive = await isPromoActive(promo.id, promo.msatBudget);

  return { ...promo, isPromoActive: isActive };
};

export const getTotalPromoEarnedByUser = async (
  userId: string,
  promoId: number
): Promise<number> => {
  const userTotalMsatEarned = await db
    .knex("promo_reward")
    .join("promo", "promo_reward.promo_id", "promo.id")
    .where({ "promo.id": promoId, "promo_reward.user_id": userId })
    .andWhere("promo_reward.is_pending", false)
    .sum("promo_reward.msat_amount as total_msat_earned")
    .groupBy("promo.msat_payout_amount")
    .first();

  return userTotalMsatEarned
    ? Number(userTotalMsatEarned.total_msat_earned)
    : 0;
};

// TODO - This uses UTC time, need to convert to local time
export const getTotalPromoEarnedByUserToday = async (
  userId: string,
  promoId: number
): Promise<number> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Set to start of day

  const userTotalMsatEarned = await db
    .knex("promo_reward")
    .join("promo", "promo_reward.promo_id", "promo.id")
    .where({
      "promo.id": promoId,
      "promo_reward.user_id": userId,
    })
    .andWhere("promo_reward.is_pending", false)
    .andWhere("promo_reward.created_at", ">=", today)
    .sum("promo_reward.msat_amount as total_msat_earned")
    .groupBy("promo.msat_payout_amount")
    .first();

  return userTotalMsatEarned
    ? Number(userTotalMsatEarned.total_msat_earned)
    : 0;
};

export const getTotalPossibleEarningsForPromoForUser = async (
  contentDuration: number,
  msatPayoutAmount: number
): Promise<number> => {
  const wholeEarningPeriods = Math.floor(contentDuration / EARNING_INTERVAL);
  return wholeEarningPeriods * msatPayoutAmount;
};

export const getTotalRewardsForUser = async (
  userId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    includePending?: boolean;
  } = {}
): Promise<number> => {
  try {
    const { startDate, endDate = new Date(), includePending = false } = options;

    let query = db
      .knex("promo_reward")
      .where("user_id", userId)
      .sum("msat_amount as total");

    // Add date range filters if provided
    if (startDate) {
      query = query.where("created_at", ">=", startDate);
    }
    query = query.where("created_at", "<=", endDate);

    // Filter pending rewards unless specifically included
    if (!includePending) {
      query = query.where("is_pending", false);
    }

    const result = await query.first();

    if (!result || result.total === null) {
      return 0;
    }

    return parseInt(result.total);
  } catch (error) {
    log.error("Error calculating total rewards for user:", error);
    return 0;
  }
};

// Helper function to get daily rewards
export const getTotalDailyRewardsForUser = async (
  userId: string,
  includePending: boolean = false
): Promise<number> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return getTotalRewardsForUser(userId, {
    startDate: today,
    includePending,
  });
};

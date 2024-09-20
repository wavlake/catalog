import log, { LogLevelDesc } from "loglevel";
log.setLevel((process.env.LOG_LEVEL as LogLevelDesc) || "info");
import db from "./db";
import { get } from "http";

const MAX_DAILY_USER_REWARDS = 200000;

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

  const promosWithBudget = activePromos.filter(async (promo) => {
    const totalSettledRewards = await getTotalSettledRewards(
      parseInt(promo.id)
    );
    const totalPendingRewards = await getTotalPendingRewards(
      parseInt(promo.id)
    );
    return promo.msatBudget > totalSettledRewards + totalPendingRewards;
  });

  return promosWithBudget;
};

async function deactivatePromo(promoId: string) {
  const promo = await db.knex("promo").where("id", promoId).first();
  if (!promo) {
    return;
  }

  const totalSettledRewards = await getTotalSettledRewards(parseInt(promoId));

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

  return parseInt(query.total);
};

const getTotalPendingRewards = async (promoId: number): Promise<number> => {
  // Set filter to 90 seconds ago
  const dateFilter = new Date(Date.now() - 90000);
  const query = await db
    .knex("promo_reward")
    .sum("msat_amount as total")
    .where("promo_id", promoId)
    .andWhere("created_at", ">", dateFilter)
    .first();

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

export const isRewardActive = async (
  promoRewardId: string
): Promise<boolean> => {
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
};

export const isPromoActive = async (promoId: string): Promise<boolean> => {
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

  const totalSettledRewards = await getTotalSettledRewards(parseInt(promoId));

  const totalPendingRewards = await getTotalPendingRewards(parseInt(promoId));

  if (totalSettledRewards + totalPendingRewards >= promo.msat_budget) {
    // Deactivate promo if settled rewards exceed budget
    await deactivatePromo(promoId);
    return false;
  }

  return true;
};

export const isUserEligibleForReward = async (
  userId: string,
  promoId: string
): Promise<boolean> => {
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

    const contentDuration = await getContentDuration(
      userDailyContentRewards.content_type,
      userDailyContentRewards.content_id
    );

    if (
      userDailyContentRewards &&
      parseInt(userDailyContentRewards.total) >=
        (userDailyContentRewards.msat_payout_amount * contentDuration) / 60
    ) {
      log.debug("User has reached the daily content reward limit");
      return false;
    }

    return true;
  } catch (error) {
    log.error(error);
    return false;
  }
};

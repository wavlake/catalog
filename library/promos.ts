import * as Sentry from "@sentry/node";
import log, { LogLevelDesc } from "loglevel";
log.setLevel((process.env.LOG_LEVEL as LogLevelDesc) || "info");
import db from "./db";
import prisma from "../prisma/client";
import zbdBatteryClient from "./zbd/zbdBatteryClient";
import { checkUserInviteStatus } from "./inviteList";
import { PaymentStatus } from "./zbd/constants";

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

  return activePromos.filter((promo) => {
    const promoRewardTotal = activePromosRewardTotals.find(
      (total) => total.promo_id === promo.id
    )?.msatTotal;

    // If no rewards have been issued for this promo, it has budget remaining
    if (!promoRewardTotal) {
      return true;
    }

    return promo.msatBudget > parseInt(promoRewardTotal);
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

  if (totalSettledRewards > promo.msat_budget) {
    Sentry.captureException(new Error(`Promo ${promoId} exceeded budget`), {
      extra: { promo, totalSettledRewards, promoBudget: promo.msat_budget },
    });
  }

  if (
    // Deactivate promo if settled rewards exceed or equal budget
    totalSettledRewards >= promo.msat_budget
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
    log.info("User has reached the daily content reward limit");
    return false;
  }

  if (
    ipDailyContentRewards &&
    parseInt(ipDailyContentRewards.total) >=
      ipDailyContentRewards.msat_payout_amount * durationRounded
  ) {
    log.info("IP has reached the daily content reward limit");
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
      log.info("User has been rewarded in the last minute");
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
      log.info("IP has been rewarded in the last minute");
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
      log.info("User has reached the daily reward limit");
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
      log.info("IP has reached the daily reward limit");
      return false;
    }

    // User has not reached the daily content reward limit
    const userIsEligibleForPromo = await isUserEligibleForPromo(
      userId,
      ip,
      promoId
    );

    if (!userIsEligibleForPromo) {
      log.info("User has reached the daily content reward limit");
      return false;
    }

    return true;
  } catch (error) {
    log.error(error);
    return false;
  }
};

export const getPromoByContentId = async (contentId: string): Promise<any> => {
  const matches = await prisma.promo.findMany({
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
    orderBy: {
      createdAt: "desc",
    },
  });

  const [mostRecentPromo] = matches;
  if (!mostRecentPromo) {
    return null;
  }

  const isActive = await isPromoActive(
    mostRecentPromo.id,
    mostRecentPromo.msatBudget
  );

  return { ...mostRecentPromo, isPromoActive: isActive };
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
  if (contentDuration < EARNING_INTERVAL) {
    // set a floor of 1 earning period
    const wholeEarningPeriods = 1;
    return wholeEarningPeriods * msatPayoutAmount;
  }

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

const REWARD_WINDOW = 24; // Check for last 24 hours
const MAX_REWARD = 1000000; // Max 1000 sats in the last 24 hours
const INVITE_LIST = "shykids-battery"; // Invite list name

export const processBatteryReward = async ({
  userId = null,
  pubkey = null,
  ipAddress,
  msatAmount,
  lnUrl,
  req,
  res,
}) => {
  try {
    if (!ipAddress || !msatAmount || !(userId || pubkey) || !lnUrl) {
      return {
        success: false,
        status: 400,
        error: "User identifier, ip, lnUrl, and msatAmount are required",
      };
    }

    if (isNaN(msatAmount) || msatAmount < 0) {
      return {
        success: false,
        status: 400,
        error: "msatAmount must be a positive number",
      };
    }

    // validate user invite status (outside transaction since it's read-only)
    const { isInvited } = await checkUserInviteStatus({
      firebaseUid: userId,
      pubkey,
      listName: INVITE_LIST,
    });

    if (!isInvited) {
      return {
        success: false,
        status: 400,
        error: "User is not eligible for battery rewards",
      };
    }

    // Check wallet balance (outside transaction)
    const balanceInfo = await zbdBatteryClient.balanceInfo();
    if (!balanceInfo.success) {
      return {
        success: false,
        status: 400,
        error: "Error getting wallet balance info",
      };
    }

    const walletBalance = parseInt(balanceInfo.data.balance);
    log.info(
      `Wallet balance: ${walletBalance} msats, requested amount: ${msatAmount} msats`
    );

    if (walletBalance < msatAmount) {
      return {
        success: false,
        status: 400,
        error: `Unable to process payment, wallet balance is too low.`,
      };
    }

    // **CRITICAL: Wrap validation and reward creation in transaction**
    const newReward = await prisma.$transaction(async (tx) => {
      // Calculate the timestamp for X hours ago
      const hoursAgo = new Date(Date.now() - REWARD_WINDOW * 60 * 60 * 1000);

      // Check if user has earned more than maxSats in the last Y hours
      const userRecentRewards = await tx.battery_reward.aggregate({
        where: {
          ...(userId ? { user_id: userId } : { pubkey }),
          created_at: {
            gt: hoursAgo,
          },
        },
        _sum: {
          msat_amount: true,
        },
      });

      const totalMsats = userRecentRewards._sum.msat_amount || 0; // Handle null case

      // Add detailed logging before validation
      log.info("Battery reward validation check", {
        userId: userId || pubkey,
        ipAddress,
        requestedAmount: msatAmount,
        currentTotal: totalMsats,
        rewardWindow: REWARD_WINDOW,
        maxReward: MAX_REWARD,
        wouldExceedLimit: totalMsats + msatAmount > MAX_REWARD,
        timestamp: new Date().toISOString(),
      });

      // Validate user limit within transaction
      if (totalMsats + msatAmount > MAX_REWARD) {
        log.warn("User would exceed reward limit", {
          userId: userId || pubkey,
          totalMsats,
          requestedAmount: msatAmount,
          combinedAmount: totalMsats + msatAmount,
          maxReward: MAX_REWARD,
          rewardWindow: REWARD_WINDOW,
        });

        throw new Error(
          `Request would exceed daily limit. Current: ${totalMsats} msats, requested: ${msatAmount} msats, limit: ${MAX_REWARD} msats`
        );
      }

      // Check if IP has already redeemed rewards
      const recentIPRewards = await tx.battery_reward.aggregate({
        where: {
          ip: ipAddress,
          created_at: {
            gt: hoursAgo,
          },
        },
        _sum: {
          msat_amount: true,
        },
      });

      const totalIPMsats = recentIPRewards._sum.msat_amount || 0; // Handle null case

      // Add IP validation logging
      log.info("IP reward validation check", {
        ipAddress,
        requestedAmount: msatAmount,
        currentIPTotal: totalIPMsats,
        wouldExceedLimit: totalIPMsats + msatAmount > MAX_REWARD,
        timestamp: new Date().toISOString(),
      });

      // Validate IP limit within transaction
      if (totalIPMsats + msatAmount > MAX_REWARD) {
        log.warn("IP would exceed reward limit", {
          ipAddress,
          totalIPMsats,
          requestedAmount: msatAmount,
          combinedAmount: totalIPMsats + msatAmount,
          maxReward: MAX_REWARD,
          rewardWindow: REWARD_WINDOW,
        });

        throw new Error(
          `IP would exceed daily limit. Current: ${totalIPMsats} msats, requested: ${msatAmount} msats, limit: ${MAX_REWARD} msats`
        );
      }

      // Create battery reward record within transaction - this locks the validation
      return await tx.battery_reward.create({
        data: {
          ...(userId ? { user_id: userId } : { pubkey }),
          msat_amount: msatAmount,
          is_pending: true,
          fee: 0,
          updated_at: new Date(),
          ip: ipAddress,
        },
      });
    });

    log.info(`Created battery reward: ${newReward.id}`);
    log.info(`Sending battery reward to ${lnUrl}`);

    // Process payment (outside transaction since it's external)
    const zbdresponse = await zbdBatteryClient.payToLNURL({
      lnAddress: lnUrl,
      amount: msatAmount.toString(),
      comment: "Shy Kids Battery",
      internalId: `battery-${newReward.id}`,
    });

    if (!zbdresponse.success) {
      log.error(`Error sending battery payment: ${zbdresponse.message}`);
      await prisma.battery_reward.update({
        where: {
          id: newReward.id,
        },
        data: {
          is_pending: false,
          status: "failed",
        },
      });

      return {
        success: false,
        status: 500,
        error: zbdresponse.message,
      };
    }

    const fee = parseInt(zbdresponse.data.fee) ?? 0;
    const amount = parseInt(zbdresponse.data.amount) ?? 0;

    await prisma.battery_reward.update({
      where: {
        id: newReward.id,
      },
      data: {
        is_pending: zbdresponse.data.status === PaymentStatus.Pending,
        status: zbdresponse.data.status,
        fee: fee,
        msat_amount: amount,
      },
    });

    await prisma.battery_balance.create({
      data: {
        msat_balance: walletBalance,
      },
    });

    return {
      success: true,
      status: 200,
      data: {
        message: `Battery reward of ${msatAmount} msats sent to ${lnUrl}`,
      },
    };
  } catch (error) {
    log.error("Error in processBatteryReward:", error);

    // Handle transaction validation errors specifically
    if (error.message && error.message.includes("exceed daily limit")) {
      return {
        success: false,
        status: 400,
        error: error.message,
      };
    }

    return {
      success: false,
      status: 500,
      error: "Error creating reward",
    };
  }
};

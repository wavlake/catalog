import log, { LogLevelDesc } from "loglevel";
log.setLevel((process.env.LOG_LEVEL as LogLevelDesc) || "info");
import asyncHandler from "express-async-handler";
import db from "@library/db";
import core from "express-serve-static-core";
import {
  getTotalPromoEarnedByUserToday,
  isPromoActive,
  isUserEligibleForReward,
  getTotalPossibleEarningsForPromoForUser,
  getTotalPromoEarnedByUser,
} from "@library/promos";
import { getContentInfoFromId } from "@library/content";
import { PromoResponseData } from "@library/common";
import prisma from "@prismalocal/client";
import { ResponseObject } from "@typescatalog/catalogApi";

const createPromoReward = asyncHandler<
  {},
  ResponseObject<PromoResponseData>,
  { promoId: number }
>(async (req, res, next) => {
  const { promoId } = req.body;
  const userId = req["uid"];

  // Validate
  if (!promoId) {
    res.status(400).json({ success: false, error: "promoId required" });
    return;
  }

  // Check if promo exists and is active
  const promo = await prisma.promo.findFirst({
    where: {
      id: promoId,
      isActive: true,
      isPending: false,
      isPaid: true,
    },
  });

  if (!promo) {
    res.status(400).json({ success: false, error: "Promo not found" });
    return;
  }

  const userIsEligible = await isUserEligibleForReward(userId, promoId);
  if (!userIsEligible) {
    res
      .status(400)
      .json({ success: false, error: "User not currently eligible" });
    return;
  }
  // Check if promo is active, and has budget
  const promoIsActive = await isPromoActive(promoId, promo.msatBudget);

  if (!promoIsActive) {
    res.status(400).json({ success: false, error: "Promo not active" });
    return;
  }

  // Create promo reward record and increment user balance
  const trx = await db.knex.transaction();
  // Lock user row while updating to prevent miscalculations on balance
  // More: https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS
  trx.raw(`"SELECT * FROM user WHERE id = ${userId} FOR UPDATE"`);

  await trx("promo_reward")
    .insert({
      user_id: userId,
      is_pending: false,
      updated_at: db.knex.fn.now(),
      promo_id: promoId,
      msat_amount: promo.msatPayoutAmount,
    })
    .where("promo_id", promoId);

  await trx("user")
    .increment("msat_balance", promo.msatPayoutAmount)
    .update({ updated_at: db.knex.fn.now() })
    .where("id", userId);

  const commit = await trx.commit().catch((error) => {
    log.error(error);
    trx.rollback();
    res
      .status(500)
      .json({ success: false, error: "Error creating promo reward" });
    return;
  });

  if (commit) {
    const userStillEligible = await isUserEligibleForReward(
      userId,
      promoId,
      true
    );
    const totalEarned = await getTotalPromoEarnedByUser(userId, promo.id);
    const totalEarnedToday = await getTotalPromoEarnedByUserToday(
      userId,
      promo.id
    );
    const contentMetadata = await getContentInfoFromId(promo.contentId);
    const totalPossibleEarningsForUser =
      await getTotalPossibleEarningsForPromoForUser(
        contentMetadata.duration,
        promo.msatPayoutAmount
      );

    res.status(200).json({
      success: true,
      data: {
        ...promo,
        promoUser: {
          lifetimeEarnings: totalEarned,
          earnedToday: totalEarnedToday,
          earnableToday: totalPossibleEarningsForUser,
          canEarnToday:
            totalEarnedToday < totalPossibleEarningsForUser &&
            userStillEligible,
        },
      },
    });
    return;
  }
});

export default { createPromoReward };

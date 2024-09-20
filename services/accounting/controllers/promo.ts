import log, { LogLevelDesc } from "loglevel";
log.setLevel((process.env.LOG_LEVEL as LogLevelDesc) || "info");
import asyncHandler from "express-async-handler";
import prisma from "@prismalocal/client";
import db from "@library/db";
import core from "express-serve-static-core";
import {
  isPromoActive,
  isRewardActive,
  isUserEligibleForReward,
} from "@library/promos";

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
        .json({ success: false, message: "Reward is invalid or expired" });
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

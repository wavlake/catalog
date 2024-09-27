import log, { LogLevelDesc } from "loglevel";
log.setLevel((process.env.LOG_LEVEL as LogLevelDesc) || "info");
import asyncHandler from "express-async-handler";
import db from "@library/db";
import core from "express-serve-static-core";
import { isPromoActive, isUserEligibleForReward } from "@library/promos";

const createPromoReward = asyncHandler<core.ParamsDictionary, any, any>(
  async (req, res, next) => {
    const { promoId } = req.body;
    const userId = req["uid"];

    // Validate
    if (!promoId) {
      res.status(400).json({ success: false, message: "promoId required" });
      return;
    }

    // Check if promo exists and is active
    const promo = await db
      .knex("promo")
      .where("id", promoId)
      .andWhere("is_active", true)
      .andWhere("is_pending", false)
      .andWhere("is_paid", true)
      .first();

    if (!promo) {
      res.status(400).json({ success: false, message: "Promo not found" });
      return;
    }

    const userIsEligible = await isUserEligibleForReward(userId, promoId);
    if (!userIsEligible) {
      res
        .status(400)
        .json({ success: false, message: "User not currently eligible" });
      return;
    }
    // Check if promo is active, and has budget
    const promoIsActive = await isPromoActive(
      parseInt(promoId),
      promo.msat_budget
    );

    if (!promoIsActive) {
      res.status(400).json({ success: false, message: "Promo not active" });
      return;
    }

    // Create promo reward record and increment user balance
    const trx = await db.knex.transaction();
    // Lock user row while updating to prevent miscalculations on balance
    // More: https://www.postgresql.org/docs/9.0/sql-select.html#SQL-FOR-UPDATE-SHARE
    trx.raw(`"SELECT * FROM user WHERE id = ${userId} FOR UPDATE"`);

    await trx("promo_reward")
      .insert({
        user_id: userId,
        is_pending: false,
        updated_at: db.knex.fn.now(),
        promo_id: promoId,
        msat_amount: promo.msat_payout_amount,
      })
      .where("promo_id", promoId);

    await trx("user")
      .increment("msat_balance", promo.msat_payout_amount)
      .update({ updated_at: db.knex.fn.now() })
      .where("id", userId);

    const commit = await trx.commit().catch((error) => {
      log.error(error);
      trx.rollback();
      res
        .status(500)
        .json({ success: false, message: "Error creating promo reward" });
      return;
    });

    if (commit) {
      const userStillEligible = await isUserEligibleForReward(
        userId,
        promoId,
        true
      );
      res.status(200).json({
        success: true,
        message: "Promo reward created",
        data: { rewardsRemaining: userStillEligible },
      });
      return;
    }
  }
);

export default { createPromoReward };

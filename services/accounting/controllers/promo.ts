import { isContentOwner } from "./../../../library/userHelper";
import log, { LogLevelDesc } from "loglevel";
log.setLevel((process.env.LOG_LEVEL as LogLevelDesc) || "info");
import asyncHandler from "express-async-handler";
import db from "@library/db";
import {
  getTotalPromoEarnedByUserToday,
  isPromoActive,
  isUserEligibleForReward,
  getTotalPossibleEarningsForPromoForUser,
  getTotalPromoEarnedByUser,
  getTotalDailyRewardsForUser,
} from "@library/promos";
import { getContentInfoFromId, getType } from "@library/content";
import { IncomingInvoiceType, PromoResponseData } from "@library/common";
import prisma from "@prismalocal/client";
import { ResponseObject } from "@typescatalog/catalogApi";
import {
  DEFAULT_EXPIRATION_SECONDS,
  MAX_INVOICE_AMOUNT,
} from "@library/constants";
import { createCharge } from "@library/zbd";
import { validate } from "uuid";
const { createHash } = require("crypto");

const createPromoReward = asyncHandler<
  {},
  ResponseObject<PromoResponseData>,
  { promoId: number }
>(async (req, res, next) => {
  const { promoId } = req.body;
  const userId = req["uid"];
  const rawIpAddress = req.ip;
  // hash ip address
  const ipAddress = createHash("MD5").update(rawIpAddress).digest("hex");

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

  // Check if user is eligible for reward

  const userIsEligible = await isUserEligibleForReward(
    userId,
    promoId,
    ipAddress
  );
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
      ip: ipAddress,
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
      ipAddress,
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

    const todaysRewards = await getTotalDailyRewardsForUser(userId);
    res.status(200).json({
      success: true,
      data: {
        ...promo,
        promoUser: {
          lifetimeEarnings: totalEarned,
          earnedToday: totalEarnedToday,
          cumulativeEarnedToday: todaysRewards,
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

const MAX_BUDGET_MULTIPLIER = 2000;
const MAX_PAYOUT_AMOUNT = 100000; // units of msats
const MIN_PAYOUT_AMOUNT = 1000; // units of msats
const MAX_NUMBER_OF_ACTIVE_PROMOS = 3;
// 10% wavlake fee
const WAVLAKE_FEE = 0.9;
const ERROR_MESSAGE_FEE = 10; // Store exact percentage
const createPromo = asyncHandler<
  {},
  ResponseObject<{ pr: string; promoId: number }>,
  {
    contentId: string;
    msatBudget: number;
    msatPayoutAmount: number;
  }
>(async (req, res, next) => {
  const { contentId, msatBudget, msatPayoutAmount } = req.body;
  const userId = req["uid"];

  if (!contentId || !msatBudget || !msatPayoutAmount) {
    res.status(400).json({
      success: false,
      error: "contentId, msatBudget, and msatPayoutAmount required",
    });
    return;
  }

  if (
    isNaN(msatBudget) ||
    msatBudget < 1000 ||
    msatBudget > MAX_INVOICE_AMOUNT
  ) {
    res.status(400).send({
      success: false,
      error: `msatBudget must be a number between 1000 and ${MAX_INVOICE_AMOUNT} (msats)`,
    });
    return;
  }

  if (
    msatPayoutAmount > MAX_PAYOUT_AMOUNT ||
    msatPayoutAmount < MIN_PAYOUT_AMOUNT
  ) {
    res.status(400).json({
      success: false,
      error: `msatPayoutAmount must be between ${MIN_PAYOUT_AMOUNT} and ${MAX_PAYOUT_AMOUNT} msats`,
    });
    return;
  }

  // Add validation for maximum budget relative to payout amount
  const maxAllowedBudget = msatPayoutAmount * MAX_BUDGET_MULTIPLIER;
  if (msatBudget > maxAllowedBudget) {
    res.status(400).json({
      success: false,
      error: `msatBudget cannot exceed ${MAX_BUDGET_MULTIPLIER} times the payout amount (${maxAllowedBudget} msats)`,
    });
    return;
  }

  // Calculate budget after fee
  const budgetAfterFee = Math.round(msatBudget * WAVLAKE_FEE); // Use Math.round instead of floor
  // Calculate suggested budgets
  const nearestLowerMinutes = Math.floor(budgetAfterFee / msatPayoutAmount);
  const nearestHigherMinutes = nearestLowerMinutes + 1;

  const satBudget = msatBudget / 1000;
  // Match frontend calculations exactly
  const suggestedBudgetSats = Math.ceil(
    (nearestLowerMinutes * msatPayoutAmount) / WAVLAKE_FEE / 1000
  );
  const nextBudgetSats = Math.ceil(
    (nearestHigherMinutes * msatPayoutAmount) / WAVLAKE_FEE / 1000
  );
  const payoutAmountSats = msatPayoutAmount / 1000;

  // Check if current budget matches either suggestion
  if (satBudget !== suggestedBudgetSats && satBudget !== nextBudgetSats) {
    res.status(400).json({
      success: false,
      error:
        `Budget must result in whole number of minutes after ${ERROR_MESSAGE_FEE}% fee. ` +
        `Suggested amounts: ${suggestedBudgetSats.toLocaleString()} or ${nextBudgetSats.toLocaleString()} sats ` +
        `(pays for ${nearestLowerMinutes} or ${nearestHigherMinutes} minutes at ${payoutAmountSats} sats per minute)`,
    });
    return;
  }

  // Rest of the controller code remains the same...
  // validate contentId
  if (!validate(contentId)) {
    res.status(400).json({
      success: false,
      error: "Invalid contentId",
    });
    return;
  }

  const contentType = await getType(contentId);
  if (!contentType || contentType !== "track") {
    res.status(400).json({
      success: false,
      error: "Only tracks are supported for promos",
    });
    return;
  }

  // Check if content exists
  const content = await prisma.track.findFirst({
    where: {
      id: contentId,
    },
  });

  if (!content) {
    res.status(400).json({ success: false, error: "Content not found" });
    return;
  }

  const isOwner = await isContentOwner(userId, contentId, contentType);

  if (!isOwner) {
    res.status(403).json({
      success: false,
      error: "You must be the owner of the track to create a promo",
    });
    return;
  }

  const userTracks = await prisma.track.findMany({
    where: {
      artist: {
        userId: userId,
      },
    },
    select: {
      id: true,
    },
  });

  // check for outstanding promos that are awaiting funding
  const existingPromos = await prisma.promo.findMany({
    where: {
      AND: [
        {
          contentId: {
            in: userTracks.map((track) => track.id),
          },
        },
        {
          contentType: "track",
        },
      ],
    },
  });

  if (existingPromos.some((promo) => promo.isPending)) {
    res.status(400).json({
      success: false,
      error:
        "You already have a pending promo. Please wait for it to be funded or cancelled.",
    });
    return;
  }

  // if more than 3 active promos, reject
  if (
    existingPromos.filter((promo) => promo.isActive).length >=
    MAX_NUMBER_OF_ACTIVE_PROMOS
  ) {
    res.status(400).json({
      success: false,
      error: `You have reached the maximum number of active promos (${MAX_NUMBER_OF_ACTIVE_PROMOS})`,
    });
    return;
  }

  // Create promo record
  const now = new Date();
  const newPromo = await prisma.promo.create({
    data: {
      contentId: contentId,
      contentType: contentType,
      // apply fee
      msatBudget: msatBudget * WAVLAKE_FEE,
      msatPayoutAmount,
      isActive: false,
      isPending: true,
      isPaid: false,
      createdAt: now,
      updatedAt: now,
      externalTransactionId: "",
      paymentRequest: "",
    },
  });

  log.debug(`Created placeholder promo invoice: ${newPromo.id}`);

  const invoiceRequest = {
    description: `Wavlake Promo`,
    amount: msatBudget.toString(),
    expiresIn: DEFAULT_EXPIRATION_SECONDS,
    internalId: `${IncomingInvoiceType.Promo}-${newPromo.id.toString()}`,
  };

  log.debug(
    `Sending create invoice request for promo: ${JSON.stringify(
      invoiceRequest
    )}`
  );

  // call ZBD api to create an invoice
  const invoiceResponse = await createCharge(invoiceRequest);

  if (!invoiceResponse.success) {
    log.error(`Error creating promo invoice: ${invoiceResponse.message}`);
    res.status(500).send({
      success: false,
      error: "There has been an error generating an invoice",
    });
    return;
  }

  log.debug(
    `Received create promo invoice response: ${JSON.stringify(invoiceResponse)}`
  );

  const updatedPromo = await prisma.promo
    .update({
      where: { id: newPromo.id },
      data: {
        paymentRequest: invoiceResponse.data.invoice.request,
        externalTransactionId: invoiceResponse.data.id,
        updatedAt: new Date(),
      },
    })
    .catch((e) => {
      log.error(`Error updating promo: ${e}`);
      return null;
    });

  if (updatedPromo) {
    res.status(200).json({
      success: true,
      data: { pr: invoiceResponse.data.invoice.request, promoId: newPromo.id },
    });
  } else {
    res.status(500).json({
      success: false,
      error: "Error creating promo",
    });
  }
});

export default { createPromoReward, createPromo };

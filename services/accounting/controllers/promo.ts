import { processBatteryReward } from "./../../../library/promos";
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
import zbdBatteryClient from "@library/zbd/zbdBatteryClient";
import { createApiErrorResponse } from "@library/errors";
import { logOutboundIpAddress } from "@library/ipLogger";
import { getProfileMetadata } from "@library/nostr/nostr";
const nlInvoice = require("@node-lightning/invoice");

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

  if (
    existingPromos.some(
      (promo) => promo.isActive && promo.contentId === contentId
    )
  ) {
    res.status(400).json({
      success: false,
      error:
        "You already have an active promo for this content. Please deactivate the exisitng promo, or wait for it to be depleted.",
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

  log.info(`Created placeholder promo invoice: ${newPromo.id}`);

  const invoiceRequest = {
    description: `Wavlake Promo`,
    amount: msatBudget.toString(),
    expiresIn: DEFAULT_EXPIRATION_SECONDS,
    internalId: `${IncomingInvoiceType.Promo}-${newPromo.id.toString()}`,
  };

  log.info(
    `Sending create invoice request for promo: ${JSON.stringify(
      invoiceRequest
    )}`
  );

  // call ZBD api to create an invoice
  const invoiceResponse = await createCharge(invoiceRequest);

  if (!invoiceResponse.success) {
    const errorMsg =
      (invoiceResponse as any).error ||
      invoiceResponse.message ||
      "Unknown error";
    log.error(`Error creating promo invoice: ${invoiceResponse.message}`);

    res.status(500).json({
      success: false,
      error: errorMsg,
    });
    return;
  }

  log.info(
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

const createBatteryReward = asyncHandler<
  {},
  ResponseObject<{ message: string }>,
  { msatAmount: number }
>(async (req, res, next) => {
  const userId = req["uid"];
  const msatAmount = req.body.msatAmount;

  const rawIpAddress = req.ip;
  // hash ip address
  const ipAddress = createHash("MD5").update(rawIpAddress).digest("hex");
  log.info(`creating battery reward for userId`, {
    userId,
    msatAmount,
    ipAddress,
  });

  if (!userId) {
    res.status(400).json({
      success: false,
      error: "userId is required",
    });
    return;
  }

  // validate msatAmount
  if (
    isNaN(msatAmount) ||
    msatAmount < 1000 ||
    msatAmount > MAX_INVOICE_AMOUNT
  ) {
    res.status(400).json({
      success: false,
      error: `msatAmount must be a number more than 1000 (msats)`,
    });
    return;
  }

  // Get user LNURL
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
    },
  });

  if (!user?.profileUrl) {
    res.status(400).json({
      success: false,
      error: "Failed to find user LNURL",
    });
    return;
  }

  const lnUrl = `${user.profileUrl}@wavlake.com`;

  // Process the reward
  const result = await processBatteryReward({
    userId,
    ipAddress,
    msatAmount,
    lnUrl,
    skipInviteCheck: true,
  });

  res
    .status(result.status)
    .json(
      result.success
        ? { success: true, data: result.data }
        : { success: false, error: result.error }
    );
});

// Nostr authentication controller
const createBatteryNostrReward = asyncHandler<
  {},
  ResponseObject<{ message: string }>,
  { msatAmount: number }
>(async (req, res, next) => {
  const pubkey = res.locals?.authEvent?.pubkey;
  const msatAmount = req.body.msatAmount;
  const rawIpAddress = req.ip;
  // hash ip address
  const ipAddress = createHash("MD5").update(rawIpAddress).digest("hex");
  log.info(`Creating battery reward for pubkey`, {
    pubkey,
    msatAmount,
    ipAddress,
  });

  if (!pubkey) {
    res.status(400).json({
      success: false,
      error: "pubkey is required",
    });
    return;
  }

  // validate msatAmount
  if (
    isNaN(msatAmount) ||
    msatAmount < 1000 ||
    msatAmount > MAX_INVOICE_AMOUNT
  ) {
    res.status(400).json({
      success: false,
      error: `msatAmount must be a number more than 1000 (msats)`,
    });
    return;
  }

  // Get user LNURL from Nostr profile
  const profileEvent = await getProfileMetadata(pubkey);

  if (!profileEvent) {
    res.status(400).json({
      success: false,
      error: "Failed to find user profile event",
    });
    return;
  }

  let lnUrl: string | undefined;
  try {
    const jsonMetadata = JSON.parse(profileEvent.content);
    lnUrl = jsonMetadata.lud06 || jsonMetadata.lud16;
  } catch (error) {
    log.error(`Error parsing profile metadata: ${error}`, profileEvent);
  }

  if (!lnUrl) {
    res.status(400).json({
      success: false,
      error: "Unable to find LNURL",
    });
    return;
  }

  // Process the reward
  const result = await processBatteryReward({
    pubkey,
    ipAddress,
    msatAmount,
    lnUrl,
    skipInviteCheck: true,
  });

  res
    .status(result.status)
    .json(
      result.success
        ? { success: true, data: result.data }
        : { success: false, error: result.error }
    );
});

const balanceStaleTime = 5 * 60 * 1000; // 5 min
const getBatteryInfo = asyncHandler(async (req, res, next) => {
  logOutboundIpAddress();
  const latestBalance = await prisma.battery_balance.findFirst({
    orderBy: {
      created_at: "desc",
    },
  });

  const balanceIsStale =
    latestBalance.created_at.getTime() + balanceStaleTime < Date.now();
  if (latestBalance && !balanceIsStale) {
    res.status(200).json({
      success: true,
      data: {
        balance: latestBalance.msat_balance,
        lastUpdated: latestBalance.created_at,
      },
    });
    return;
  }

  const info = await zbdBatteryClient.balanceInfo();
  if (!info.success) {
    res.status(400).json({
      success: false,
      error: "Error getting battery info",
    });
    return;
  }

  const newBalance = await prisma.battery_balance.create({
    data: {
      msat_balance: parseInt(info.data.balance),
    },
  });

  res.status(200).json({
    success: true,
    data: {
      balance: newBalance.msat_balance,
      lastUpdated: newBalance.created_at,
    },
  });
});

const getBatteryInvoice = asyncHandler(async (req, res, next) => {
  try {
    const request = {
      msatAmount: req.body.msatAmount,
    };

    if (
      isNaN(request.msatAmount) ||
      request.msatAmount < 1000 ||
      request.msatAmount > MAX_INVOICE_AMOUNT
    ) {
      res
        .status(400)
        .json(
          createApiErrorResponse(
            `Amount must be a number between 1000 and ${MAX_INVOICE_AMOUNT} (msats)`,
            "INVALID_AMOUNT"
          )
        );
      return;
    }

    const invoiceRequest = {
      description: `Battery Charge`,
      amount: request.msatAmount.toString(),
      expiresIn: DEFAULT_EXPIRATION_SECONDS,
      internalId: `battery-${Date.now()}`,
    };

    log.info(
      `Sending create invoice request for battery charge: ${JSON.stringify(
        invoiceRequest
      )}`
    );

    // call ZBD api to create an invoice
    const invoiceResponse = await zbdBatteryClient.createInvoice(
      invoiceRequest
    );

    if (!invoiceResponse.success) {
      const errorMsg =
        (invoiceResponse as any).error ||
        invoiceResponse.message ||
        "Unknown error";
      log.error(`Error creating battery invoice: ${errorMsg}`);

      res.status(500).json({
        success: false,
        error: errorMsg,
      });
      return;
    }

    log.info(
      `Received create invoice response: ${JSON.stringify(invoiceResponse)}`
    );

    // Update successful response to match LUD-06 spec format
    res.json({
      pr: invoiceResponse.data.invoice.request,
      routes: [], // An empty array as specified in the LUD-06 spec
    });
    return;
  } catch (e) {
    log.error(`Error in createDeposit: ${e.message}`, e);

    res
      .status(500)
      .json(
        createApiErrorResponse(
          "An error occurred while processing your request",
          "SERVER_ERROR",
          { message: e.message }
        )
      );
    return;
  }
});

export default {
  createPromoReward,
  createBatteryReward,
  createBatteryNostrReward,
  createPromo,
  getBatteryInfo,
  getBatteryInvoice,
};

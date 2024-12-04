import asyncHandler from "express-async-handler";
import type { Promo, TrackInfo } from "@prisma/client";
import {
  identifyActivePromosWithBudgetRemaining,
  identifyPromosWhereUserEarnedToday,
  getPromoByContentId,
  getTotalPromoEarnedByUser,
  getTotalPromoEarnedByUserToday,
  getTotalPossibleEarningsForPromoForUser,
} from "../library/promos";
import { getContentInfoFromId } from "../library/content";
import { PromoResponseUser } from "../library/common";
import { ResponseObject } from "../types/catalogApi";
import { shuffle } from "../library/helpers";
import prisma from "../prisma/client";
import { isContentOwner, SplitContentTypes } from "../library/userHelper";

export const getActivePromos = asyncHandler<
  {},
  ResponseObject<
    Array<
      Promo & {
        promoUser?: PromoResponseUser;
        contentMetadata?: TrackInfo;
      }
    >
  >,
  {}
>(async (req, res, next) => {
  const request = {
    accountId: req["uid"],
  };
  const { accountId } = request;

  if (!accountId) {
    res.status(400).send({
      success: false,
      error: "Missing accountId",
    });
    return;
  }

  const activePromos = await identifyActivePromosWithBudgetRemaining();
  const userPromos = await identifyPromosWhereUserEarnedToday(accountId);
  // Combine and remove duplicates
  const allPromos = [...activePromos, ...userPromos].filter(
    (promo, index, self) =>
      index ===
      self.findIndex(
        (t) => t.id === promo.id && t.contentId === promo.contentId
      )
  );
  const activePromosWithContentMetadata = await Promise.all(
    allPromos.map(async (promo) => {
      const contentMetadata = await getContentInfoFromId(promo.contentId);
      if (!contentMetadata) {
        return;
      }

      const totalEarned = await getTotalPromoEarnedByUser(accountId, promo.id);
      const totalEarnedToday = await getTotalPromoEarnedByUserToday(
        accountId,
        promo.id
      );

      const totalPossibleEarningsForUser =
        await getTotalPossibleEarningsForPromoForUser(
          contentMetadata.duration,
          promo.msatPayoutAmount
        );
      const promoIsActive = !!activePromos.find((p) => p.id === promo.id);

      return {
        ...promo,
        contentMetadata,
        promoUser: {
          lifetimeEarnings: totalEarned,
          earnedToday: totalEarnedToday,
          earnableToday: totalPossibleEarningsForUser,
          canEarnToday:
            promoIsActive && totalEarnedToday < totalPossibleEarningsForUser,
        },
      };
    })
  );
  res.json({
    success: true,
    data: shuffle(activePromosWithContentMetadata),
  });
  return;
});

export const getPromoByContent = asyncHandler<
  { contentId: string },
  ResponseObject<
    Array<
      Promo & {
        promoUser?: PromoResponseUser;
      }
    >
  >
>(async (req, res, next) => {
  const request = {
    accountId: req["uid"],
  };
  const { accountId } = request;
  const { contentId } = req.params;

  if (!contentId) {
    res.status(400).send({
      success: false,
      error: "Missing contentId",
    });
    return;
  }
  const promo = await getPromoByContentId(contentId);

  if (!promo.isActive) {
    res.json({
      success: true,
      data: promo,
    });
    return;
  }

  const contentMetadata = await getContentInfoFromId(contentId);

  const totalEarned = await getTotalPromoEarnedByUser(accountId, promo.id);

  const totalEarnedToday = await getTotalPromoEarnedByUserToday(
    accountId,
    promo.id
  );

  const totalPossibleEarningsForUser =
    await getTotalPossibleEarningsForPromoForUser(
      contentMetadata.duration,
      promo.msatPayoutAmount
    );

  res.json({
    success: true,
    data: {
      ...promo,
      promoUser: {
        lifetimeEarnings: totalEarned,
        earnedToday: totalEarnedToday,
        earnableToday: totalPossibleEarningsForUser,
        canEarnToday: totalEarnedToday < totalPossibleEarningsForUser,
      },
    },
  });
  return;
});

export const getPromo = asyncHandler<
  { id: string },
  ResponseObject<Promo & { remainingBudget: number }>,
  { id: string }
>(async (req, res, next) => {
  const userId = req["uid"];
  const { id } = req.params;

  if (!id) {
    res.status(400).send({
      success: false,
      error: "Missing promo id",
    });
    return;
  }

  const idInt = parseInt(id);
  if (typeof idInt !== "number") {
    res.status(400).send({
      success: false,
      error: "Invalid promo id",
    });
    return;
  }

  const promo = await prisma.promo.findFirst({
    where: {
      id: idInt,
    },
  });

  if (!promo) {
    res.json({
      success: false,
      error: "Promo not found",
    });
    return;
  }

  const isOwner = await isContentOwner(
    userId,
    promo.contentId,
    promo.contentType as SplitContentTypes
  );

  if (!isOwner) {
    res.status(403).send({
      success: false,
      error: "Unauthorized",
    });
    return;
  }
  const msatSpent = await prisma.promoReward.aggregate({
    where: {
      promoId: idInt,
    },
    _sum: {
      msatAmount: true,
    },
  });

  const remainingBudget = promo.msatBudget - msatSpent._sum.msatAmount || 0;

  res.json({
    success: true,
    data: { ...promo, remainingBudget },
  });
});

export const editPromo = asyncHandler<
  { id: string },
  ResponseObject<Promo>,
  { id: string; isActive: boolean }
>(async (req, res, next) => {
  const userId = req["uid"];
  const { id } = req.params;
  const { isActive } = req.body;

  if (!id) {
    res.status(400).send({
      success: false,
      error: "Missing promo id",
    });
    return;
  }

  const idInt = parseInt(id);
  if (typeof idInt !== "number") {
    res.status(400).send({
      success: false,
      error: "Invalid promo id",
    });
    return;
  }

  const promo = await prisma.promo.findFirst({
    where: {
      id: idInt,
    },
  });

  const isOwner = await isContentOwner(
    userId,
    promo.contentId,
    promo.contentType as SplitContentTypes
  );

  if (!isOwner) {
    res.status(403).send({
      success: false,
      error: "Unauthorized",
    });
    return;
  }

  const updatedPromo = await prisma.promo.update({
    where: {
      id: idInt,
    },
    data: {
      // only allow isActive to be toggled if promo is paid
      isActive: promo.isPaid ? isActive : false,
      updatedAt: new Date(),
    },
  });

  res.json({
    success: true,
    data: updatedPromo,
  });
});

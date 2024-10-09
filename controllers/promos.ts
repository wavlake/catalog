import asyncHandler from "express-async-handler";
import {
  identifyActivePromosWithBudgetRemaining,
  identifyPromosWhereUserEarnedToday,
  getPromoByContentId,
  getTotalPromoEarnedByUser,
  getTotalPromoEarnedByUserToday,
  getTotalPossibleEarningsForPromoForUser,
} from "../library/promos";
import { getContentInfoFromId } from "../library/content";
import { PromoResponseData } from "../library/common";
import { Response } from "express";

interface PromoResponse extends Response {
  data?: PromoResponseData;
}

interface PromoResponseList extends Response {
  data: PromoResponseData[];
}

export const getActivePromos = asyncHandler(
  async (req, res: PromoResponseList, next) => {
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

        const totalEarned = await getTotalPromoEarnedByUser(
          accountId,
          promo.id
        );
        const totalEarnedToday = await getTotalPromoEarnedByUserToday(
          accountId,
          promo.id
        );

        const totalPossibleEarningsForUser =
          await getTotalPossibleEarningsForPromoForUser(
            contentMetadata.duration,
            promo.msatPayoutAmount
          );

        return {
          ...promo,
          contentMetadata,
          promoUser: {
            lifetimeEarnings: totalEarned,
            totalEarnedToday: totalEarnedToday,
            availableEarnings: totalPossibleEarningsForUser,
            canEarnToday: totalEarnedToday < totalPossibleEarningsForUser,
          },
        };
      })
    );
    res.json({
      success: true,
      data: activePromosWithContentMetadata,
    });
    return;
  }
);

export const getPromoByContent = asyncHandler(
  async (req, res: PromoResponse, next) => {
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
        data: null,
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
          totalEarnedToday: totalEarnedToday,
          availableEarnings: totalPossibleEarningsForUser,
          canEarnToday: totalEarnedToday < totalPossibleEarningsForUser,
        },
      },
    });
    return;
  }
);

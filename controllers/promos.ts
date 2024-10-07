import asyncHandler from "express-async-handler";
import {
  identifyActivePromosWithBudgetRemaining,
  getPromoByContentId,
  isUserEligibleForPromo,
  getTotalPromoEarnedByUser,
  getTotalPromoEarnedByUserToday,
} from "../library/promos";
import { getContentInfoFromId } from "../library/content";

export const getActivePromos = asyncHandler(async (req, res, next) => {
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

  const activePromos = await identifyActivePromosWithBudgetRemaining(accountId);
  const activePromosWithContentMetadata = await Promise.all(
    activePromos.map(async (promo) => {
      const contentMetadata = await getContentInfoFromId(promo.contentId);
      const totalEarned = await getTotalPromoEarnedByUser(accountId, promo.id);
      const totalEarnedToday = await getTotalPromoEarnedByUserToday(
        accountId,
        promo.id
      );

      if (!contentMetadata) {
        return;
      }
      return { ...promo, contentMetadata, totalEarned, totalEarnedToday };
    })
  );
  res.json({
    success: true,
    data: activePromosWithContentMetadata,
  });
  return;
});

export const getPromoByContent = asyncHandler(async (req, res, next) => {
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

  const activePromo = await getPromoByContentId(contentId);

  const isEligible = await isUserEligibleForPromo(accountId, activePromo.id);

  const totalEarned = await getTotalPromoEarnedByUser(
    accountId,
    activePromo.id
  );

  const totalEarnedToday = await getTotalPromoEarnedByUserToday(
    accountId,
    activePromo.id
  );

  if (!activePromo) {
    res.json({
      success: true,
      data: null,
    });
    return;
  }

  res.json({
    success: true,
    data: {
      ...activePromo,
      rewardsRemaining: isEligible,
      totalEarned,
      totalEarnedToday,
    },
  });
  return;
});

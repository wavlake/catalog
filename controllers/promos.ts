import asyncHandler from "express-async-handler";
import {
  identifyActivePromosWithBudgetRemaining,
  identifyPromosWhereUserEarnedToday,
  getPromoByContentId,
  isUserEligibleForPromo,
  getTotalPromoEarnedByUser,
  getTotalPromoEarnedByUserToday,
  EARNING_INTERVAL,
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

      const wholeEarningPeriods = Math.floor(
        contentMetadata.duration / EARNING_INTERVAL
      );
      const availableEarnings = wholeEarningPeriods * promo.msatPayoutAmount;

      return {
        ...promo,
        contentMetadata,
        totalEarned,
        totalEarnedToday,
        availableEarnings,
        rewardsRemaining: totalEarnedToday < availableEarnings,
      };
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
  const contentMetadata = await getContentInfoFromId(contentId);

  const isEligible = await isUserEligibleForPromo(accountId, activePromo.id);

  const totalEarned = await getTotalPromoEarnedByUser(
    accountId,
    activePromo.id
  );

  const totalEarnedToday = await getTotalPromoEarnedByUserToday(
    accountId,
    activePromo.id
  );

  const wholeEarningPeriods = Math.floor(
    contentMetadata.duration / EARNING_INTERVAL
  );
  const availableEarnings = wholeEarningPeriods * activePromo.msatPayoutAmount;

  if (!activePromo && totalEarnedToday != 0) {
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
      availableEarnings,
    },
  });
  return;
});

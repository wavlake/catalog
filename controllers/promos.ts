import asyncHandler from "express-async-handler";
import {
  identifyActivePromosWithBudgetRemaining,
  getPromoByContentId,
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
      if (!promo) {
        return;
      }
      const contentMetadata = await getContentInfoFromId(promo.contentId);
      if (!contentMetadata) {
        return;
      }
      return { ...promo, contentMetadata };
    })
  );
  res.json({
    success: true,
    data: activePromosWithContentMetadata,
  });
  return;
});

export const getPromoByContent = asyncHandler(async (req, res, next) => {
  const { contentId } = req.params;

  if (!contentId) {
    res.status(400).send({
      success: false,
      error: "Missing contentId",
    });
    return;
  }

  const activePromo = await getPromoByContentId(contentId);

  if (!activePromo) {
    res.json({
      success: true,
      data: null,
    });
    return;
  }

  res.json({
    success: true,
    data: activePromo,
  });
  return;
});

import asyncHandler from "express-async-handler";
import { identifyActivePromosWithBudgetRemaining } from "../library/promos";
import { getContentInfoFromId } from "../library/content";

export const getActivePromos = asyncHandler(async (req, res, next) => {
  const activePromos = await identifyActivePromosWithBudgetRemaining();

  const activePromosWithContentMetadata = await Promise.all(
    activePromos.map(async (promo) => {
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

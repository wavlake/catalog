import asyncHandler from "express-async-handler";
import prisma from "../prisma/client";

const get_referrer_public = asyncHandler(async (req, res, next) => {
  const { referrerId } = req.params;

  const referrer = await prisma.referrerApp.findUnique({
    where: {
      id: referrerId.toUpperCase(),
    },
  });

  if (!referrer) {
    res.status(404).send({ success: false, error: "App not found" });
    return;
  }

  res.send({ success: true, data: { name: referrer.name } });
});

export default {
  get_referrer_public,
};

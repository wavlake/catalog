import prisma from "../prisma/client";
import db from "../library/db";
import log from "loglevel";
import { randomUUID } from "crypto";
import s3Client from "../library/s3Client";
import asyncHandler from "express-async-handler";
import { formatError } from "../library/errors";

const randomSampleSize = process.env.RANDOM_SAMPLE_SIZE;

const s3BucketName = `${process.env.AWS_S3_BUCKET_NAME}`;
const cdnDomain = `${process.env.AWS_CDN_DOMAIN}`;
const trackPrefix = `${process.env.AWS_S3_TRACK_PREFIX}`;
const rawPrefix = `${process.env.AWS_S3_RAW_PREFIX}`;

const get_track = asyncHandler(async (req, res, next) => {
  const request = {
    trackId: req.params.trackId,
  };

  const track = await prisma.trackInfo.findFirstOrThrow({
    where: { id: request.trackId },
  });

  res.json({ success: true, data: track });
});

const get_tracks_by_account = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
  };

  const tracks = await prisma.user.findMany({
    where: { id: request.userId },
    include: {
      artist: {
        include: {
          album: {
            where: { deleted: false },
            include: { track: { where: { deleted: false } } },
          },
        },
      },
    },
  });

  res.json({ success: true, data: tracks });
});

export default {
  get_track,
  get_tracks_by_account,
};

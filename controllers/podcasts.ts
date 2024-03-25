import log from "loglevel";
import db from "../library/db";
import { randomUUID } from "crypto";
import fs from "fs";
import multer from "multer";
import Jimp from "jimp";
import s3Client from "../library/s3Client";
import format from "../library/format";
import prisma from "../prisma/client";
import asyncHandler from "express-async-handler";
import { formatError } from "../library/errors";
import { isPodcastOwner } from "../library/userHelper";
import { invalidateCdn } from "../library/cloudfrontClient";
import { getStatus } from "../library/helpers";
import { AWS_S3_IMAGE_PREFIX } from "../library/constants";
import { upload_image } from "../library/artwork";

const localConvertPath = `${process.env.LOCAL_CONVERT_PATH}`;
const cdnDomain = `${process.env.AWS_CDN_DOMAIN}`;

export const get_podcasts_by_account = asyncHandler(async (req, res, next) => {
  const { uid } = req.params;

  if (!uid) {
    res.status(400).send("userId is required");
  } else {
    const podcasts = await prisma.podcast.findMany({
      where: { userId: uid, deleted: false },
    });

    res.json({
      success: true,
      data: podcasts.map((podcast) => ({
        ...podcast,
        status: getStatus(podcast.isDraft, podcast.publishedAt),
      })),
    });
  }
});

export const get_podcast_by_id = asyncHandler(async (req, res, next) => {
  const { podcastId } = req.params;

  const podcast = await prisma.podcast.findFirstOrThrow({
    where: { id: podcastId },
  });

  res.json({ success: true, data: podcast });
});

export const get_podcast_by_url = asyncHandler(async (req, res, next) => {
  const { podcastUrl } = req.params;

  const podcast = await prisma.podcast.findFirstOrThrow({
    where: { podcastUrl },
  });

  res.json({ success: true, data: podcast });
});

export const create_podcast = asyncHandler(async (req, res, next) => {
  const newPodcastId = randomUUID();
  const {
    name,
    description,
    twitter,
    npub,
    instagram,
    youtube,
    website,
    primaryCategoryId,
    secondaryCategoryId,
    primarySubcategoryId,
    secondarySubcategoryId,
  } = req.body;

  const userId = req["uid"];
  const artwork = req.file;

  if (!name) {
    const error = formatError(403, "Podcast name is required");
    next(error);
    return;
  }

  const cdnImageUrl = artwork
    ? await upload_image(artwork, newPodcastId, "podcast")
    : undefined;

  return db
    .knex("podcast")
    .insert(
      {
        id: newPodcastId,
        user_id: userId,
        name,
        description,
        twitter,
        instagram,
        npub,
        youtube,
        website,
        artwork_url: cdnImageUrl,
        podcast_url: format.urlFriendly(name),
        // all newly created content starts a draft, user must publish after creation
        is_draft: true,
        primary_category_id: primaryCategoryId,
        secondary_category_id: secondaryCategoryId,
        primary_subcategory_id: primarySubcategoryId,
        secondary_subcategory_id: secondarySubcategoryId,
      },
      ["*"]
    )
    .then((data) => {
      log.debug(`Created new podcast ${name} with id: ${data[0]["id"]}`);

      res.send({
        success: true,
        data: {
          id: data[0]["id"],
          userId: data[0]["user_id"],
          name: data[0]["name"],
          bio: data[0]["bio"],
          twitter: data[0]["twitter"],
          instagram: data[0]["instagram"],
          npub: data[0]["npub"],
          youtube: data[0]["youtube"],
          website: data[0]["website"],
          artworkUrl: data[0]["artwork_url"],
          podcastUrl: data[0]["podcast_url"],
          isDraft: data[0]["is_draft"],
          publishedAt: data[0]["published_at"],
          categoryId: data[0]["category_id"],
        },
      });
    })
    .catch((err) => {
      if (err instanceof multer.MulterError) {
        log.debug(`MulterError creating new podcast: ${err}`);

        res.status(500).send("Something went wrong");
      } else if (err) {
        log.debug(`Error creating new podcast: ${err}`);
        if (err.message.includes("duplicate")) {
          res.status(500).json({
            success: false,
            error: "Podcast with that name already exists",
          });
        } else {
          res.status(500).json({
            success: false,
            error: "Something went wrong creating the podcast.",
          });
        }
      }
    });
});

export const update_podcast = asyncHandler(async (req, res, next) => {
  const {
    podcastId,
    name,
    description,
    twitter,
    npub,
    instagram,
    youtube,
    website,
    primaryCategoryId,
    secondaryCategoryId,
    primarySubcategoryId,
    secondarySubcategoryId,
  } = req.body;
  const uid = req["uid"];

  const artwork = req.file;
  const updatedAt = new Date();

  if (!podcastId) {
    const error = formatError(403, "podcastId field is required");
    next(error);
    return;
  }

  // Check if user owns podcast
  const isOwner = await isPodcastOwner(uid, podcastId);

  if (!isOwner) {
    const error = formatError(403, "User does not own this podcast");
    next(error);
    return;
  }

  const cdnImageUrl = artwork
    ? await upload_image(artwork, podcastId, "podcast")
    : undefined;

  log.debug(`Editing podcast ${podcastId}`);
  const updatedPodcast = await prisma.podcast.update({
    where: {
      id: podcastId,
    },
    data: {
      name,
      description,
      twitter,
      npub,
      instagram,
      youtube,
      website,
      updatedAt,
      primaryCategoryId,
      secondaryCategoryId,
      primarySubcategoryId,
      secondarySubcategoryId,
      ...(cdnImageUrl ? { artworkUrl: cdnImageUrl } : {}),
    },
  });

  res.json({ success: true, data: updatedPodcast });
});

// TODO: Add clean up step for old artwork, see update_podcast_art
export const delete_podcast = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req["uid"],
    podcastId: req.params.podcastId,
  };

  if (!request.podcastId) {
    const error = formatError(403, "podcastId field is required");
    next(error);
    return;
  }

  // Check if user owns artist
  const isOwner = await isPodcastOwner(request.userId, request.podcastId);

  if (!isOwner) {
    const error = formatError(403, "User does not own this podcast");
    next(error);
    return;
  }

  log.debug(`Checking episodes for podcast ${request.podcastId}`);
  db.knex("episode")
    .select("episode.podcast_id as podcastId", "episode.deleted")
    .where("episode.podcast_id", "=", request.podcastId)
    .andWhere("episode.deleted", false)
    .then((data) => {
      if (data.length > 0) {
        const error = formatError(403, "Podcast has undeleted episodes");
        next(error);
      } else {
        log.debug(`Deleting podcast ${request.podcastId}`);
        db.knex("podcast")
          .where("id", "=", request.podcastId)
          .update({ deleted: true }, ["id", "name"])
          .then((data) => {
            res.send({ success: true, data: data[0] });
          })
          .catch((err) => {
            log.debug(`Error deleting podcast ${request.podcastId}: ${err}`);
            next(err);
          });
      }
    })
    .catch((err) => {
      log.debug(`Error deleting podcast ${request.podcastId}: ${err}`);
      next(err);
    });
});

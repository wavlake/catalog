import asyncHandler from "express-async-handler";
import prisma from "../prisma/client";
import log from "loglevel";
import { validate } from "uuid";
import { SplitContentTypes } from "../library/userHelper";
import knex from "knex";
import db from "../library/db";

const calculatedPublishedAt = (isDraft: boolean) => {
  // now in server UTC time
  const now = new Date();
  // TODO - consume the date from the request when scheduling is implemented
  const scheduledDate = new Date();

  // if the content is being published set the publishedAt field to the current time
  // if the content is being unpublished set the publishedAt field to undefined
  return isDraft ? undefined : now;
};

// const publishedAt = calculatedPublishedAt(isDraft);
// this route is for publishing and unpublishing content
const publish_content = asyncHandler(async (req, res, next) => {
  // default is to publish the content now (no body needed)
  // can specifiy a scheduled publish date in the future by sending a date in the request body
  // can unpublish by sending isDraft: true in the request body
  const { contentId } = req.params;
  // contentType is inferred from the contentId and added to the body, via the checkContentOwnership middleware
  const {
    isDraft = false,
    publishedAt = new Date(),
    contentType,
  } = req.body as {
    isDraft: boolean;
    publishedAt: Date;
    contentType: SplitContentTypes;
  };

  if (!validate(contentId)) {
    res.status(400).json({ error: "Invalid content Id" });
    return;
  }

  if (!["track", "episode", "podcast", "album"].includes(contentType)) {
    res.status(400).json({ error: "Invalid content type" });
    return;
  }

  const dbTrx = await db.knex.transaction();
  const isAlbum = contentType === "album";
  const isPodcast = contentType === "podcast";
  const isTrack = contentType === "track";
  const isEpisode = contentType === "episode";

  if (isAlbum || isPodcast) {
    const newPublishedAt = calculatedPublishedAt(isDraft);
    // update the parent
    await dbTrx(contentType).where("id", contentId).update({
      isDraft,
      publishedAt: newPublishedAt,
    });

    // update all children
    const childrenIds = knex(isAlbum ? "track" : "episode")
      .select("id")
      .where(isAlbum ? "album_id" : "podcast_id", contentId);

    await dbTrx(isAlbum ? "track" : "episode")
      .update({
        isDraft,
        publishedAt: newPublishedAt,
      })
      .whereIn("id", childrenIds);

    return dbTrx
      .commit()
      .then(() => {
        log.info(`Published ${contentType}_id: ${contentId} successfully.`);
        log.info({ isDraft, newPublishedAt });
        res.status(200).json({
          success: true,
          data: {
            publishedAt: newPublishedAt,
            isDraft,
            contentId,
            contentType,
            childrenIds,
          },
        });
      })
      .catch((e) => {
        log.error(`Failed to publish ${contentType}_id: ${contentId}`);
        log.error({ isDraft, newPublishedAt });
        log.error(e);
      });
  }

  if (isTrack || isEpisode) {
    const newPublishedAt = calculatedPublishedAt(isDraft);
    // update the content
    await dbTrx(contentType).where("id", contentId).update({
      isDraft,
      publishedAt: newPublishedAt,
    });

    if (!isDraft) {
      // if we are publishing the content, we need to verify the parent is published as well
      const parent = await dbTrx(isTrack ? "album" : "podcast")
        .where("id", contentId)
        .first();

      // if the parent is a draft, we need flip it to published
      if (parent.isDraft) {
        await dbTrx(isTrack ? "album" : "podcast")
          .where("id", contentId)
          .update({
            isDraft: false,
            publishedAt: newPublishedAt,
          });
      }
    }

    return dbTrx
      .commit()
      .then(() => {
        log.info(`Published ${contentType}_id: ${contentId} successfully.`);
        log.info({ isDraft, newPublishedAt });
        res.status(200).json({
          success: true,
          data: {
            publishedAt: newPublishedAt,
            isDraft,
            contentId,
            contentType,
          },
        });
      })
      .catch((e) => {
        log.error(`Failed to publish ${contentType}_id: ${contentId}`);
        log.error({ isDraft, newPublishedAt });
        log.error(e);
      });
  }
});

export { publish_content };

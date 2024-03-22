import asyncHandler from "express-async-handler";
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
      is_draft: isDraft,
      published_at: newPublishedAt,
    });

    // update all children
    const childrenIds = await db
      .knex(isAlbum ? "track" : "episode")
      .select("id")
      .where(isAlbum ? "album_id" : "podcast_id", contentId);

    await dbTrx(isAlbum ? "track" : "episode")
      .update({
        is_draft: isDraft,
        published_at: newPublishedAt,
      })
      .whereIn(
        "id",
        childrenIds.map((child) => child.id)
      );

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
        log.info(`Failed to publish ${contentType}_id: ${contentId}`);
        log.info({ isDraft, newPublishedAt });
        log.error(e);
        res.status(500).json({
          success: false,
          error: "Something went wrong",
        });
      });
  }

  if (isTrack || isEpisode) {
    const newPublishedAt = calculatedPublishedAt(isDraft);
    // update the content
    await dbTrx(contentType).where("id", contentId).update({
      is_draft: isDraft,
      published_at: newPublishedAt,
    });

    // if we are publishing the content, we need to verify the parent is published as well
    if (!isDraft) {
      const parentTable = isTrack ? "album" : "podcast";
      const parent = await db
        .knex(contentType)
        .join(
          parentTable,
          `${contentType}.${parentTable}_id`,
          "=",
          `${parentTable}.id`
        )
        .select(`${parentTable}.is_draft`)
        .first();

      // if the parent is in draft, we need flip it to published
      if (parent.isDraft) {
        await dbTrx(parentTable).where("id", contentId).update({
          is_draft: false,
          published_at: newPublishedAt,
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
        log.info(`Failed to publish ${contentType}_id: ${contentId}`);
        log.info({ isDraft, newPublishedAt });
        log.error(e);
        res.status(500).json({
          success: false,
          error: "Something went wrong",
        });
      });
  }
});

export { publish_content };

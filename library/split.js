const log = require("loglevel");
import db from "./db";
const content = require("./content");

exports.calculateCombinedSplits = async (splitRecipients, timeSplit) => {
  const contentType = await content.getType(timeSplit.content_id);

  const timeSplitRecipients = await exports.getSplitRecipientsAndShares(
    timeSplit.content_id,
    contentType
  );

  const timeSplitShare = timeSplit.shareNumerator / timeSplit.shareDenominator;

  const remainingShare = 1 - timeSplitShare;

  // Update timeSplitRecipients shares to reflect the timeSplitShare
  timeSplitRecipients.forEach((recipient) => {
    recipient.splitPercentage = recipient.splitPercentage * timeSplitShare;
  });

  // Update splitRecipients shares to reflect the remainingShare
  splitRecipients.forEach((recipient) => {
    recipient.splitPercentage = recipient.splitPercentage * remainingShare;
  });

  // Combine the two arrays and remove any objects that have a share of 0
  return splitRecipients
    .concat(timeSplitRecipients)
    .filter((recipient) => recipient.splitPercentage > 0);
};

exports.calculatePercentages = async (splitRecipients) => {
  const totalShares = splitRecipients.reduce((acc, curr) => {
    return acc + curr.share;
  }, 0);
  // log.debug(`Total shares: ${totalShares}`);

  return splitRecipients.map((recipient) => {
    return {
      userId: recipient.userId,
      splitPercentage: recipient.share / totalShares,
    };
  });
};

exports.getOwnerId = async (contentId, type) => {
  if (type == "track") {
    return db
      .knex("track")
      .join("artist", "track.artist_id", "=", "artist.id")
      .join("user", "artist.user_id", "=", "user.id")
      .select("user.id as userId")
      .where("track.id", "=", contentId)
      .first()
      .then((data) => {
        if (!data) {
          return null;
        }
        return [{ userId: data.userId, splitPercentage: 1 }];
      })
      .catch((err) => {
        log.error(`Error finding owner from contentId ${err}`);
      });
  } else {
    return db
      .knex("episode")
      .join("podcast", "episode.podcast_id", "=", "podcast.id")
      .join("user", "podcast.user_id", "=", "user.id")
      .select("user.id as userId")
      .where("episode.id", "=", contentId)
      .first()
      .then((data) => {
        if (!data) {
          return null;
        }
        return [{ userId: data.userId, splitPercentage: 1 }];
      })
      .catch((err) => {
        log.error(`Error finding owner from contentId ${err}`);
      });
  }
};

exports.getSplitRecipientsAndShares = async (contentId, type) => {
  const splitId = await exports.getSplitId(contentId, type);

  if (splitId) {
    const splitRecipients = await exports.getSplitRecipients(splitId);
    if (splitRecipients) {
      return exports.calculatePercentages(splitRecipients);
    } else {
      log.debug(`No recipient(s) found for content: ${contentId}`);
      return null;
    }
  } else {
    return exports.getOwnerId(contentId, type);
  }
};

exports.getHigherLevelSplitId = async (contentId, type) => {
  if (type == "track") {
    return db
      .knex("track")
      .join("split", "track.album_id", "=", "split.content_id")
      .select("split.id")
      .where("track.id", "=", contentId)
      .first()
      .then((data) => {
        if (!data) {
          log.debug(`No higher-level split for content: ${contentId}`);
          return null;
        }
        return data.id;
      })
      .catch((err) => {
        log.error(`Error finding higher-level splitId from contentId ${err}`);
      });
  } else if (type == "episode") {
    return db
      .knex("episode")
      .join("split", "episode.podcast_id", "=", "split.content_id")
      .select("split.id")
      .where("episode.id", "=", contentId)
      .first()
      .then((data) => {
        if (!data) {
          log.debug(`No higher-level split for content: ${contentId}`);
          return null;
        }
        return data.id;
      })
      .catch((err) => {
        log.error(`Error finding higher-level splitId from contentId ${err}`);
      });
  } else {
    log.debug(
      `Content is not a track or episode: ${contentId}, skipping higher-level split check`
    );
    return null;
  }
};

exports.getSplitId = async (contentId, type) => {
  return db
    .knex("split")
    .where("content_id", "=", contentId)
    .andWhere("content_type", "=", type)
    .first()
    .then((data) => {
      // Splits at track/episode level take precendence over podcast/album-level splits
      if (!data) {
        log.debug(
          `No split found for content: ${contentId}, checking for higher-level split`
        );
        const higherLevelSplitId = exports.getHigherLevelSplitId(
          contentId,
          type
        );
        return higherLevelSplitId;
      }
      return data.id;
    })
    .catch((err) => {
      log.error(`Error finding splitId from contentId ${err}`);
    });
};

exports.getSplitRecipients = async (splitId) => {
  log.debug(`Getting split recipients for splitId: ${splitId}`);
  return db
    .knex("split_recipient")
    .select("user_id as userId", "share as share")
    .where("split_id", "=", splitId)
    .then((data) => {
      if (data.length > 0) {
        log.debug(`Found ${data.length} split recipients`);
        return data;
      }
      return null;
    })
    .catch((err) => {
      log.error(`Error finding splitId from contentId ${err}`);
    });
};

exports.getTimeSplit = async (contentId, timeSeconds) => {
  return db
    .knex("time_split")
    .select(
      "id",
      "content_id as contentId",
      "share_numerator as shareNumerator",
      "share_denominator as shareDenominator"
    )
    .where("content_id", "=", contentId)
    .andWhere("start_seconds", "<=", timeSeconds)
    .andWhere("end_seconds", ">=", timeSeconds)
    .first()
    .then((data) => {
      if (!data) {
        return null;
      }
      return data;
    })
    .catch((err) => {
      log.error(`Error finding time split from contentId ${err}`);
    });
};

export default exports;

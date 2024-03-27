import db from "./db";
const log = require("loglevel");
const content = require("./content");

export const addLightningAddresses = async (splitRecipients) => {
  const addresses = await Promise.all(
    splitRecipients.map((recipient) => {
      return db
        .knex("user")
        .select("lightning_address")
        .where("id", "=", recipient.userId)
        .first()
        .then((data) => {
          return data.lightning_address;
        });
    })
  );

  return splitRecipients.map((recipient, index) => {
    recipient.lightningAddress = addresses[index];
    return recipient;
  });
};

export const calculateCombinedSplits = async (splitRecipients, timeSplit) => {
  const contentType = await content.getType(timeSplit.recipientContentId);

  const timeSplitRecipients = await exports.getSplitRecipientsAndShares(
    timeSplit.recipientContentId,
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

export const calculatePercentages = async (
  splitRecipients,
  contentId,
  type
) => {
  const totalShares = splitRecipients.reduce((acc, curr) => {
    return acc + curr.share;
  }, 0);
  // log.debug(`Total shares: ${totalShares}`);

  return splitRecipients.map((recipient) => {
    return {
      contentId: contentId,
      contentType: type,
      userId: recipient.userId,
      splitPercentage: recipient.share / totalShares,
    };
  });
};

// Returns the content owner's userId
export const getOwnerId = async (contentId, type) => {
  const typesMap = {
    track: { mainTable: "track", joinTable: "artist", joinColumn: "artist_id" },
    episode: {
      mainTable: "episode",
      joinTable: "podcast",
      joinColumn: "podcast_id",
    },
    podcast: { mainTable: "podcast" },
    album: { mainTable: "album", joinTable: "artist", joinColumn: "artist_id" },
    artist: { mainTable: "artist" },
  };

  const typeConfig = typesMap[type];
  if (!typeConfig) {
    log.error(`Invalid type: ${type}`);
    return;
  }

  try {
    let query;

    if (typeConfig.joinTable) {
      query = db
        .knex(typeConfig.mainTable)
        .join(
          typeConfig.joinTable,
          `${typeConfig.mainTable}.${typeConfig.joinColumn}`,
          "=",
          `${typeConfig.joinTable}.id`
        )
        .join("user", `${typeConfig.joinTable}.user_id`, "=", "user.id");
    } else {
      query = db
        .knex(typeConfig.mainTable)
        .join("user", `${typeConfig.mainTable}.user_id`, "=", "user.id");
    }

    const data = await query
      .select("user.id as userId")
      .where(`${typeConfig.mainTable}.id`, "=", contentId)
      .first();

    log.debug(
      `Found content owner userId: ${JSON.stringify(
        data
      )} for contentId: ${contentId}`
    );
    return data ? data.userId : null;
  } catch (err) {
    log.error(`Error finding owner from contentId ${contentId}: ${err}`);
  }

  log.error(`Inalid content type: ${type}`);
  return [];
};

// returns a list of split recipients
export const getSplitRecipientsAndShares = async (contentId, contentType) => {
  const splitId = await exports.getSplitId(contentId, contentType);

  if (splitId) {
    const splitRecipients = await exports.getSplitRecipients(splitId);
    if (splitRecipients) {
      return exports.calculatePercentages(
        splitRecipients,
        contentId,
        contentType
      );
    } else {
      log.debug(`No recipient(s) found for content: ${contentId}`);
      return null;
    }
  } else {
    // If no split is found, return the owner of the content with a 100% split
    const userId = await exports.getOwnerId(contentId, contentType);
    return [
      {
        contentType,
        contentId,
        userId,
        splitPercentage: 1,
      },
    ];
  }
};

export const getHigherLevelSplitId = async (contentId, type) => {
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

export const getSplitId = async (contentId, type) => {
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

export const getSplitRecipients = async (splitId) => {
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

export const getTimeSplit = async (contentId, contentTime, contentType) => {
  if (contentTime === -1) return null;

  // only tracks and episodes can have time splits
  if (contentType === "album" || contentType === "podcast") {
    return null;
  }

  if (!contentTime) {
    log.debug(`No timeSeconds provided, skipping time split check`);
    return null;
  }
  return db
    .knex("time_split")
    .select(
      "id",
      "content_id as contentId",
      "share_numerator as shareNumerator",
      "share_denominator as shareDenominator",
      "recipient_content_id as recipientContentId"
    )
    .where("content_id", "=", contentId)
    .andWhere("start_seconds", "<=", contentTime)
    .andWhere("end_seconds", ">=", contentTime)
    .first()
    .then((data) => {
      if (!data) {
        return null;
      }
      log.debug(`Found time split: ${JSON.stringify(data)}`);
      return data;
    })
    .catch((err) => {
      log.error(`Error finding time split from contentId ${err}`);
    });
};

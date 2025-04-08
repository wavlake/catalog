import db from "../library/db";
import {
  earnings,
  transactions,
  nwcTransactions,
  forwards,
  internalAmps,
  externalAmps,
  pendingForwards,
  promoEarnings,
  getMaxAmpDate,
  getMaxTransactionDate,
  getEarningsDetail,
  getSplitDetail,
  getZapSendDetail,
  getAutoforwardDetail,
  getWithdrawDetail,
  getDepositDetail,
  getZapDetail,
  getTopUpDetail,
  getTicketPayments,
  getTicketDetail,
} from "../library/queries/transactions";
import { TransactionType } from "../library/common";
import asyncHandler from "express-async-handler";
import prisma from "../prisma/client";
import log from "../library/winston";
import { auth } from "../library/firebaseService";
import { validateLightningAddress } from "../library/zbd/zbdClient";
import { urlFriendly } from "../library/format";
import { upload_image } from "../library/artwork";
import { getZBDRedirectInfo, getZBDUserInfo } from "../library/zbd/login";
import { updateNpubMetadata } from "../library/nostr/nostr";
import { ResponseObject } from "../types/catalogApi";
import {
  createUserPubkey,
  createUserVerification,
  createUserWithAvatar,
  getRandomName,
  usernameIsAvailable,
  validateAndGenerateUsername,
  validateUsername,
} from "../library/userHelper";
import {
  addEmailToInviteList,
  checkUserInviteStatus,
} from "../library/inviteList";

const get_account = asyncHandler(async (req, res, next) => {
  const request = {
    accountId: req["uid"],
  };
  log.info("get_account uid:", req["uid"]);
  try {
    const userData = await db
      .knex("user")
      .select(
        "user.id as id",
        "user.name as name",
        "user.msat_balance as msatBalance",
        "user.amp_msat as ampMsat",
        "user.artwork_url as artworkUrl",
        "user.profile_url as profileUrl",
        "user.is_locked as isLocked",
        "user.lightning_address as lightningAddress"
      )
      .where("user.id", "=", request.accountId);

    const trackData = await db
      .knex("playlist")
      .join("playlist_track", "playlist.id", "=", "playlist_track.playlist_id")
      .join("track", "track.id", "=", "playlist_track.track_id")
      .select("track.id", "playlist.id as playlistId")
      .where("playlist.user_id", "=", request.accountId)
      .where("playlist.is_favorites", "=", true);

    const isRegionVerified = await db
      .knex("user_verification")
      .select("first_name")
      .where("user_id", "=", request.accountId)
      .first();

    const userPubkeysWithMetadata = await db
      .knex("user_pubkey")
      .join("npub", "user_pubkey.pubkey", "=", "npub.public_hex")
      .where("user_pubkey.user_id", request.accountId)
      .select(
        "user_pubkey.pubkey",
        "user_pubkey.created_at",
        "npub.public_hex",
        "npub.metadata",
        "npub.follower_count",
        "npub.follows"
      )
      .orderBy("user_pubkey.created_at", "desc");

    const { emailVerified, providerData } = await auth().getUser(
      request.accountId
    );

    const responseData = {
      ...userData[0],
      nostrProfileData: userPubkeysWithMetadata.map((pubkey) => ({
        publicHex: pubkey.pubkey,
        metadata: pubkey.metadata,
        followerCount: pubkey.follower_count,
        follows: pubkey.follows,
      })),
      emailVerified,
      isRegionVerified: !!isRegionVerified,
      providerId: providerData[0]?.providerId,
      userFavoritesId: (trackData[0] || {}).playlistId,
      userFavorites: trackData.map((track) => track.id),
    };

    res.send({
      success: true,
      data: responseData,
    });
  } catch (err) {
    next(err);
    return;
  }
});

const get_user_public = asyncHandler(async (req, res, next) => {
  const request = {
    userProfileUrl: req.params.userProfileUrl,
  };

  const userProfileData = await db
    .knex("user")
    .leftJoin("playlist", function () {
      this.on("playlist.user_id", "=", "user.id").andOn(
        "playlist.is_favorites",
        "=",
        db.knex.raw("?", [true])
      );
    })
    .select(
      "user.id as id",
      "user.name as name",
      "user.artwork_url as artworkUrl",
      "user.profile_url as profileUrl",
      "playlist.id as userFavoritesId"
    )
    .where("user.profile_url", "=", request.userProfileUrl)
    .first();

  if (!userProfileData) {
    res.status(404).json({
      success: false,
      error: "User not found",
    });
    return;
  }

  res.send({ success: true, data: userProfileData });
});

const get_announcements = asyncHandler(async (req, res, next) => {
  const request = {
    accountId: req["uid"],
  };

  const lastActivityCheckAt = await db
    .knex("user")
    .select("last_activity_check_at")
    .where("id", "=", request.accountId)
    .first()
    .then((data) => {
      return data.last_activity_check_at ?? new Date();
    });

  // Subtract to the last activity check so annoucements last at least 24 hours
  const lastActivityCheckMinus24Hours = new Date(lastActivityCheckAt);
  lastActivityCheckMinus24Hours.setHours(
    lastActivityCheckMinus24Hours.getHours() - 24
  );

  return db
    .knex("announcement")
    .select(
      "id as id",
      "title as title",
      "content as content",
      "link as link",
      "created_at as createdAt"
    )
    .where("announcement.created_at", ">", lastActivityCheckMinus24Hours)
    .orderBy("announcement.created_at", "desc")
    .then((data) => {
      res.send({
        success: true,
        data: data,
      });
    });
});

const get_notification = asyncHandler(async (req, res, next) => {
  const request = {
    accountId: req["uid"],
  };

  const lastActivityCheckAt = await db
    .knex("user")
    .select("last_activity_check_at")
    .where("id", "=", request.accountId)
    .first()
    .then((data) => {
      return data.last_activity_check_at ?? new Date();
    });

  const latestAnnouncement = await db
    .knex("announcement")
    .max("created_at")
    .first()
    .then((data) => {
      if (!data?.max) return null;

      return data.max;
    });

  const notifyUser = await db.knex
    .unionAll([
      getMaxAmpDate(request.accountId),
      getMaxTransactionDate(request.accountId),
    ])
    .orderBy("created_at", "desc")
    .first()
    .then((data) => {
      if (!data?.created_at) return false;

      const latestDate =
        latestAnnouncement > data.created_at
          ? latestAnnouncement
          : data.created_at;
      return latestDate > lastActivityCheckAt;
    });

  res.send({
    success: true,
    data: { notify: notifyUser },
  });
});

const put_notification = asyncHandler(async (req, res, next) => {
  const request = {
    accountId: req["uid"],
  };

  db.knex("user")
    .update({ last_activity_check_at: db.knex.fn.now() })
    .where("user.id", "=", request.accountId)
    .then(() => {
      res.send({
        success: true,
      });
    })
    .catch((err) => {
      next(err);
      return;
    });
});

const get_features = asyncHandler(async (req, res, next) => {
  try {
    const userId = req["uid"];

    const flags = await prisma.userFlag.findMany({
      where: {
        userId,
      },
      include: {
        featureFlag: true,
      },
    });

    res.send({
      success: true,
      data: flags.map((flag) => flag.featureFlag.name),
    });
  } catch (err) {
    next(err);
    return;
  }
});

const get_splits = asyncHandler(async (req, res, next) => {
  const userId = req["uid"];
  const { id } = req.params;

  const splits = await getSplitDetail(id);

  if (!splits || splits.length === 0) {
    res.status(404).json({
      success: false,
      error: "No splits with that id",
    });
    return;
  }

  // check if user is part of the split
  const userSplit = splits.find((split) => split.userId === userId);

  if (!userSplit) {
    res.status(403).json({
      success: false,
      error: "Unauthorized",
    });
    return;
  }

  res.send({
    success: true,
    data: splits,
  });
});

const get_tx_id = asyncHandler(async (req, res, next) => {
  const userId = req["uid"];
  const { type, id } = req.params;

  let data;
  switch (type) {
    case TransactionType.EARNINGS:
      data = await getEarningsDetail(userId, id);
      break;
    case TransactionType.DEPOSIT:
      data = await getDepositDetail(userId, id);
      break;
    case TransactionType.WITHDRAW:
      data = await getWithdrawDetail(userId, id);
      break;
    case TransactionType.ZAP:
      data = await getZapDetail(userId, id);
      break;
    case TransactionType.AUTOFORWARD:
      data = await getAutoforwardDetail(userId, id);
      break;
    case TransactionType.ZAP_SEND:
      data = await getZapSendDetail(userId, id);
      break;
    case TransactionType.TOPUP:
      data = await getTopUpDetail(userId, id);
      break;
    case TransactionType.TICKET:
      data = await getTicketDetail(userId, id);
      break;
    default:
      res.status(400).json({
        success: false,
        error: "Invalid transaction type",
      });
      return;
  }

  const formatData = {
    ...data,
    feeMsat: data.feemsat ? data.feemsat : data.feeMsat,
    createDate: data.created_at ? data.created_at : data.created_at,
    paymentId: data.paymentid ? data.paymentid : data.paymentId,
    msatAmount: data.msatamount ? data.msatamount : data.msatAmount,
    failureReason: data.failurereason ? data.failurereason : data.failureReason,
  };

  res.json({ success: true, data: formatData });
});

const PAGE_SIZE = 40;
const get_txs = asyncHandler(async (req, res, next) => {
  const userId = req["uid"];
  const { page } = req.params;
  const filters = req.query.filters as string | undefined;

  const pageInt = parseInt(page);
  if (!Number.isInteger(pageInt) || pageInt <= 0) {
    res.status(400).json({
      success: false,
      error: "page must be a positive integer",
    });
    return;
  }

  // Build the query based on filters
  let query;
  if (!filters) {
    // If no filters, use all transaction types
    query = db.knex.select("*").from(
      db
        .knex(transactions(userId))
        .unionAll([
          nwcTransactions(userId),
          forwards(userId),
          earnings(userId),
          internalAmps(userId),
          externalAmps(userId),
          pendingForwards(userId),
          promoEarnings(userId),
          getTicketPayments(userId),
        ])
        .as("all_transactions")
    );
  } else {
    const activeFilters = filters
      .split(",")
      .map((filter) => decodeURIComponent(filter));

    // Start with an empty array of queries
    const queryArray = [];

    // Add relevant queries based on filters
    if (
      activeFilters.includes(TransactionType.DEPOSIT) ||
      activeFilters.includes(TransactionType.WITHDRAW) ||
      activeFilters.includes(TransactionType.ZAP)
    ) {
      // Create a base transaction query with type filter
      const transactionTypes = activeFilters.filter((type) =>
        [
          TransactionType.DEPOSIT,
          TransactionType.WITHDRAW,
          TransactionType.ZAP,
        ].includes(type as TransactionType)
      );
      const transactionQuery = db
        .knex(transactions(userId))
        .whereIn("type", transactionTypes)
        .as("filtered_transactions");
      queryArray.push(db.knex.select("*").from(transactionQuery));
    }

    if (activeFilters.includes(TransactionType.ZAP_SEND)) {
      queryArray.push(nwcTransactions(userId));
      queryArray.push(internalAmps(userId));
      queryArray.push(externalAmps(userId));
    }

    if (activeFilters.includes(TransactionType.AUTOFORWARD)) {
      queryArray.push(forwards(userId));
      queryArray.push(pendingForwards(userId));
    }

    if (activeFilters.includes(TransactionType.EARNINGS)) {
      queryArray.push(earnings(userId));
    }

    if (activeFilters.includes(TransactionType.TOPUP)) {
      queryArray.push(promoEarnings(userId));
    }

    // Add the new filter for tickets
    if (activeFilters.includes(TransactionType.TICKET)) {
      queryArray.push(getTicketPayments(userId));
    }

    // Combine queries if any exist
    query =
      queryArray.length > 0
        ? db.knex
            .select("*")
            .from(db.knex.union(queryArray, true).as("filtered_transactions"))
        : db.knex
            .select("*")
            .from(db.knex.raw("SELECT NULL as empty WHERE false"))
            .as("empty_result");
  }

  // Apply sorting and pagination
  const txs = await query.orderBy("created_at", "desc").paginate({
    perPage: PAGE_SIZE,
    currentPage: pageInt,
    isLengthAware: true,
  });

  // Format the results
  const txsModified = {};
  txs.data.forEach((tx) => {
    const createDate = new Date(tx.created_at);
    const date = `${createDate.toLocaleString("default", {
      month: "long",
    })} ${createDate.getDate()}`;

    if (!txsModified[date]) {
      txsModified[date] = [];
    }
    txsModified[date].push({
      ...tx,
      isPending: tx.ispending,
      feeMsat: tx.feemsat,
      paymentId: tx.paymentid,
    });
  });

  res.json({
    success: true,
    data: {
      transactions: txsModified,
      pagination: {
        currentPage: txs.pagination.currentPage,
        perPage: txs.pagination.perPage,
        total: txs.pagination.total,
        totalPages: txs.pagination.lastPage,
      },
    },
  });
});

const get_check_region = asyncHandler(async (req, res, next) => {
  // Respond with 200 if request gets past middleware
  res.send(200);
});

const post_log_identity = asyncHandler(async (req, res, next) => {
  const userId = req["uid"];
  const { firstName, lastName } = req.body;

  if (!firstName || !lastName) {
    res.status(400).json({
      success: false,
      error: "First name and last name are required",
    });
    return;
  }

  const userRecord = await auth().getUser(userId);

  if (!userRecord.emailVerified) {
    res.status(400).json({
      success: false,
      error: "Email is not verified",
    });
    return;
  }

  try {
    await prisma.userVerification.upsert({
      where: {
        userId: userId,
      },
      update: {
        firstName: firstName,
        lastName: lastName,
        ip: req.ip,
      },
      create: {
        userId: userId,
        firstName: firstName,
        lastName: lastName,
        ip: req.ip,
      },
    });

    res.send({
      success: true,
      data: { userId: userId },
    });
  } catch (err) {
    next(err);
    return;
  }
});

const create_update_lnaddress = asyncHandler(async (req, res, next) => {
  const userId = req["uid"];
  const { lightningAddress } = req.body;

  if (!lightningAddress) {
    res.status(400).json({
      success: false,
      error: "Address is required",
    });
    return;
  }

  if (lightningAddress.includes("wavlake.com")) {
    res.status(400).json({
      success: false,
      error: "Autoforwarding to a Wavlake address is not allowed",
    });
    return;
  }

  const isValidAddress = await validateLightningAddress(lightningAddress);

  if (!isValidAddress) {
    res.status(400).json({
      success: false,
      error: "Invalid lightning address",
    });
    return;
  }

  try {
    await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        lightningAddress: lightningAddress,
      },
    });

    res.send({
      success: true,
      data: { userId: userId, lightningAddress: lightningAddress },
    });
  } catch (err) {
    next(err);
    return;
  }
});

const delete_lnaddress = asyncHandler(async (req, res, next) => {
  const userId = req["uid"];

  try {
    await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        lightningAddress: null,
      },
    });

    res.send({
      success: true,
      data: { userId: userId },
    });
    return;
  } catch (err) {
    next(err);
    return;
  }
});

const edit_account = asyncHandler(async (req, res, next) => {
  const userId = req["uid"];
  const { name, ampMsat } = req.body;
  const artwork = req.file;

  try {
    let ampMsatInt;
    if (ampMsat) {
      ampMsatInt = parseInt(ampMsat);
      if (!Number.isInteger(ampMsatInt) || ampMsatInt < 1000) {
        res.status(400).json({
          success: false,
          error: "ampMsat must be an integer greater than 1000 (1 sat)",
        });
        return;
      }
    }

    let profileUrl;
    // if updating name, check if it's available
    if (name) {
      // generate profile url
      profileUrl = urlFriendly(name);
      const isValid = validateUsername(profileUrl);

      if (!isValid) {
        res.status(400).json({
          success: false,
          error:
            "Name should only contain letters, numbers, underscores, hyphens, and be available",
        });
        return;
      }

      const existingUser = await prisma.user.findUnique({
        where: {
          profileUrl: profileUrl,
        },
      });
      if (existingUser && existingUser.id !== userId) {
        res.status(400).json({
          success: false,
          error: "Name is already taken",
        });
        return;
      }
    }

    let cdnImageUrl;
    if (artwork) {
      cdnImageUrl = await upload_image(artwork, userId, "user");
    }

    await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        name,
        ...(ampMsatInt ? { ampMsat: ampMsatInt } : {}),
        profileUrl,
        ...(cdnImageUrl ? { artworkUrl: cdnImageUrl } : {}),
      },
    });

    res.send({
      success: true,
      data: { userId: userId, name: name },
    });
  } catch (err) {
    log.error("Error editing account", { ...req.body, userId });
    log.error(err);
    next(err);
    return;
  }
});

// called by wavlake client to get zbd login url
const get_zbd_redirect_info = asyncHandler(async (req, res, next) => {
  const encodedRedirectUri = req.query.redirectUri as string;
  const redirectUri = decodeURIComponent(encodedRedirectUri);

  const data = await getZBDRedirectInfo(redirectUri);
  res.send({
    success: true,
    data,
  });
});

// called by client to get zbd user data
const get_login_token_for_zbd_user = asyncHandler(async (req, res, next) => {
  try {
    const userData = await getZBDUserInfo(req.body);
    if (!userData || !userData.email) {
      res.status(500).send({
        success: false,
        error: "Failed to get ZBD user data",
      });
      return;
    }

    const existingUserIdMapping = await prisma.external_user.findFirst({
      where: {
        external_id: userData.id,
        provider: "zbd",
      },
    });
    // confirm this user exists in firebase (it may have been deleted/out of sync with the external user table)
    const existingUserId = existingUserIdMapping?.firebase_uid
      ? await auth()
          .getUser(existingUserIdMapping.firebase_uid)
          .catch((e) => {
            // not found or no mapping
            return null;
          })
      : false;
    const existingUserEmail = await auth()
      .getUserByEmail(userData.email)
      .catch((e) => {
        // not found
        return null;
      });

    let firebaseLoginToken;

    if (existingUserId) {
      // we matched a firebase user uid with the incoming ZBD id
      firebaseLoginToken = await auth().createCustomToken(existingUserId.uid);
    } else if (existingUserEmail) {
      // we matched a firebase user email with the incoming ZBD email
      // this won't modify the firebase user, it will just let the user access the account
      firebaseLoginToken = await auth().createCustomToken(
        existingUserEmail.uid
      );
    } else {
      // no match, so create a new user in firebase + db tables
      const user = await auth().createUser({
        email: userData.email,
        emailVerified: false,
      });

      const incomingUsername = userData?.gamerTag;

      // Validate username
      let username = await validateAndGenerateUsername(incomingUsername);

      if (!username) {
        username = await getRandomName();
      }

      // create the new user record in the user table
      await prisma.user.create({
        data: {
          id: user.uid,
          name: username,
          lightningAddress: userData.lightningAddress,
          profileUrl: urlFriendly(username),
        },
      });

      // save the user id to the external user table, or update if it already exists
      await prisma.external_user.upsert({
        where: {
          external_id: userData.id,
        },
        update: {
          firebase_uid: user.uid,
          provider: "zbd",
        },
        create: {
          external_id: userData.id,
          firebase_uid: user.uid,
          provider: "zbd",
        },
      });

      // get a token for the user
      firebaseLoginToken = await auth().createCustomToken(user.uid);
    }

    if (!firebaseLoginToken) {
      log.error("Error getting firebase token for zbd user");
      res.status(500).send({
        success: false,
        error: "Failed to create login token",
      });
      return;
    }

    res.send({
      success: true,
      data: {
        ...userData,
        token: firebaseLoginToken,
      },
    });
  } catch (err) {
    log.error("Error getting zbd user data", err);
    res.status(500).send({
      success: false,
      error: "Failed to get login token for ZBD user",
    });
  }
});

const add_pubkey_to_account = asyncHandler(async (req, res, next) => {
  const { authToken } = req.body;
  const pubkey = res.locals.authEvent.pubkey;

  if (!authToken) {
    res.status(400).json({
      success: false,
      error: "authToken is required",
    });
    return;
  }

  try {
    log.info("validating authToken");
    const user = await auth().verifyIdToken(authToken);
    log.info("valid authToken for uid: ", user.uid);

    const existingPubkey = await prisma.userPubkey.findFirst({
      where: {
        pubkey,
      },
    });

    if (existingPubkey) {
      if (existingPubkey.userId === user.uid) {
        // pubkey is already associated with this user
        // update the created at timestamp for the row, so it is treated as the most recent pubkey
        await prisma.userPubkey.update({
          where: {
            pubkey: pubkey,
          },
          data: {
            createdAt: new Date(),
          },
        });
        res.status(200).json({
          success: true,
        });
        return;
      }
      res.status(400).json({
        success: false,
        error: "Pubkey is registered to another account",
      });
      return;
    }

    await prisma.userPubkey.create({
      data: {
        userId: user.uid,
        pubkey: pubkey,
        createdAt: new Date(),
      },
    });

    res.send({
      success: true,
      data: { userId: user.uid, pubkey },
    });
  } catch (err) {
    log.error("Error adding pubkey to account", { pubkey });
    log.error(err);
    next(err);
    return;
  }
});
const delete_pubkey_from_account = asyncHandler(async (req, res, next) => {
  const userId = req["uid"];
  const pubkey = req.params.pubkey;

  if (!pubkey) {
    res.status(400).json({
      success: false,
      error: "pubkey is required",
    });
    return;
  }

  try {
    await prisma.userPubkey.delete({
      where: {
        pubkey: pubkey,
      },
    });
    const pubkeys = await prisma.userPubkey.findMany({
      where: {
        userId,
      },
      select: {
        pubkey: true,
      },
    });

    res.send({
      success: true,
      data: { userId: userId, pubkeys: pubkeys.map((row) => row.pubkey) },
    });
  } catch (err) {
    log.error("Error deleting pubkey from account", { ...req.body, userId });
    log.error(err);
    next(err);
    return;
  }
});

const get_pubkey_metadata = asyncHandler(async (req, res, next) => {
  const pubkey = req.params.pubkey;

  if (!pubkey) {
    res.status(400).json({
      success: false,
      error: "pubkey is required",
    });
    return;
  }

  try {
    const pubkeyMetadata = await prisma.npub.findUnique({
      where: {
        publicHex: pubkey,
      },
    });

    if (!pubkeyMetadata) {
      const response = await updateNpubMetadata(pubkey);

      res.status(response.success ? 200 : 404).send(response);
      return;
    }

    res.send({
      success: true,
      data: pubkeyMetadata,
    });
  } catch (err) {
    log.error("Error getting pubkey metadata", { pubkey });
    log.error(err);
    next(err);
    return;
  }
});

const update_metadata = asyncHandler(async (req, res, next) => {
  const pubkey = req.params.pubkey;

  if (!pubkey) {
    res.status(400).json({
      success: false,
      error: "pubkey is required",
    });
    return;
  }

  try {
    const response = await updateNpubMetadata(pubkey, true);

    res.status(response.success ? 200 : 404).send(response);
  } catch (err) {
    log.error("Error updating pubkey metadata", { pubkey });
    log.error(err);
    next(err);
    return;
  }
});

const check_user_verified = asyncHandler(async (req, res, next) => {
  const userProfileUrl = req.params.userProfileUrl;

  const user = await prisma.user.findFirst({
    where: {
      profileUrl: userProfileUrl,
    },
  });

  if (!user) {
    res.status(404).json({
      success: false,
      error: "User not found",
    });
    return;
  }

  const isVerified = await prisma.userVerification.findFirst({
    where: {
      userId: user.id,
    },
  });

  if (!isVerified) {
    res.status(403).json({
      success: false,
      error: "User not verified",
    });
    return;
  }

  res.send({
    success: true,
    data: {
      userId: user.id,
    },
  });
});

const get_check_username = asyncHandler(async (req, res, next) => {
  const { username } = req.params;

  if (!username) {
    res.status(400).json({
      success: false,
      error: "username is required",
    });
    return;
  }

  const usernameOK = await usernameIsAvailable(username);

  const validUsername = await validateUsername(username);

  if (!usernameOK) {
    res.status(400).json({
      success: false,
      error: "username is already taken",
    });
    return;
  }

  if (!validUsername) {
    res.status(400).json({
      success: false,
      error:
        "Name should only contain letters, numbers, underscores, and hyphens",
    });
    return;
  }

  res.send({
    success: true,
    data: {
      username,
    },
  });
});

const get_random_username = asyncHandler(async (req, res, next) => {
  const newUserName = await getRandomName();

  if (!newUserName) {
    res.status(500).json({
      success: false,
      error: "Error generating random username",
    });
    return;
  }

  res.send({
    success: true,
    data: {
      username: newUserName,
    },
  });
});

// Common types
type UserResponse = ResponseObject<{
  uid: string;
  username: string;
  profileUrl: string;
  pubkey: string;
}>;

type UserCreateRequest = {
  username?: string;
  pubkey?: string;
};

type UserVerifiedRequest = UserCreateRequest & {
  firstName?: string;
  lastName?: string;
};

const create_user = asyncHandler<{}, UserResponse, UserCreateRequest>(
  async (req, res, next) => {
    try {
      const userId = req["uid"];
      const { username: providedUsername, pubkey } = req.body;

      // Validate username
      const username = await validateAndGenerateUsername(providedUsername);
      if (!username) {
        res.status(400).json({
          success: false,
          error:
            "Invalid username. Should only contain letters, numbers, underscores, and hyphens, and must be available.",
        });
        return;
      }

      // Create user with avatar
      const newUser = await createUserWithAvatar(userId, username);

      // Create pubkey if provided
      const userPubkey = await createUserPubkey(userId, pubkey);

      res.status(201).json({
        success: true,
        data: {
          uid: userId,
          username: newUser.name,
          profileUrl: newUser.profileUrl,
          pubkey: userPubkey?.pubkey,
        },
      });
    } catch (err) {
      log.error("Error creating new user", req.body);
      log.error(err);
      next(err);
    }
  }
);

const create_user_verified = asyncHandler<
  {},
  UserResponse,
  UserVerifiedRequest
>(async (req, res, next) => {
  try {
    const userId = req["uid"];
    const {
      username: providedUsername,
      firstName,
      lastName,
      pubkey,
    } = req.body;

    // Validate username
    const username = await validateAndGenerateUsername(providedUsername);
    if (!username) {
      res.status(400).json({
        success: false,
        error:
          "Invalid username. Should only contain letters, numbers, underscores, and hyphens, and must be available.",
      });
      return;
    }

    // Create user with avatar
    const newUser = await createUserWithAvatar(userId, username);

    // Create pubkey if provided
    const userPubkey = await createUserPubkey(userId, pubkey);

    // Create verification record
    await createUserVerification(userId, firstName, lastName, req.ip);

    res.status(201).json({
      success: true,
      data: {
        uid: userId,
        username: newUser.name,
        profileUrl: newUser.profileUrl,
        pubkey: userPubkey?.pubkey,
      },
    });
  } catch (err) {
    log.error("Error creating new verified user", req.body);
    log.error(err);
    next(err);
  }
});

const get_track_promos = asyncHandler(async (req, res, next) => {
  const userId = req["uid"];

  try {
    const userTrackIds = await prisma.track.findMany({
      where: {
        artist: {
          userId: userId,
        },
      },
      select: {
        id: true,
      },
    });

    // Get all promos for tracks owned by the user
    const userPromos = await prisma.promo.findMany({
      where: {
        contentType: "track",
        contentId: {
          in: userTrackIds.map((t) => t.id),
        },
      },
      select: {
        id: true,
        contentId: true,
        msatBudget: true,
        msatPayoutAmount: true,
        isActive: true,
        isPaid: true,
        isPending: true,
        createdAt: true,
        updatedAt: true,
        contentType: true,
        paymentRequest: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const payoutsByPromo = await prisma.promoReward.groupBy({
      by: ["promoId"],
      where: {
        promoId: {
          in: userPromos.map((p) => p.id),
        },
      },
      _sum: {
        msatAmount: true,
      },
    });

    const promoPayoutMap = payoutsByPromo.reduce((acc, curr) => {
      acc[curr.promoId] = curr._sum.msatAmount;
      return acc;
    }, {});

    // get distinct user counts for each promo
    const uniqueUserCounts = await db
      .knex("promo_reward")
      .select("promo_id")
      .countDistinct("user_id")
      .whereIn(
        "promo_id",
        userPromos.map((p) => p.id)
      )
      .groupBy("promo_id");

    // calculate remaining msat balance for each promo
    const promosWithBalanceInfo = userPromos.map((promo) => {
      const remainingBudget =
        promo.msatBudget - (promoPayoutMap[promo.id] || 0);
      // add unique user count
      const uniqueUsers =
        uniqueUserCounts.find((u) => u.promo_id === promo.id)?.count || 0;
      return {
        ...promo,
        remainingBudget,
        uniqueUsers: parseInt(uniqueUsers),
      };
    });

    res.send({
      success: true,
      data: promosWithBalanceInfo,
    });
  } catch (err) {
    log.error("Error fetching track promos", err);
    next(err);
    return;
  }
});

const disable_user = asyncHandler(async (req, res, next) => {
  const userId = req["uid"];

  try {
    auth().updateUser(userId, {
      disabled: true,
    });

    res.send({
      success: true,
    });
  } catch (err) {
    log.error("Error disabling user", err);
    res.status(500).send({
      success: false,
      error: "Failed to disable user",
    });
    return;
  }
});

const get_inbox_lastread = asyncHandler(async (req, res, next) => {
  const userId = req["uid"];

  try {
    const lastRead = await prisma.user.findFirstOrThrow({
      where: {
        id: userId,
      },
      select: {
        lastInboxRead: true,
      },
    });

    res.send({
      success: true,
      data: lastRead.lastInboxRead,
    });
  } catch (err) {
    log.error("Error fetching inbox last read", err);
    res.status(500).send({
      success: false,
      error: "Error fetching inbox last read",
    });
    return;
  }
});

const put_inbox_lastread = asyncHandler(async (req, res, next) => {
  const userId = req["uid"];
  const now = new Date();

  try {
    await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        lastInboxRead: now,
      },
    });

    res.send({
      success: true,
    });
  } catch (err) {
    log.error("Error updating inbox last read", err);
    res.status(500).send({
      success: false,
      error: "Error updating inbox last read",
    });
    return;
  }
});

const get_invite_list_status = asyncHandler(async (req, res, next) => {
  const userId = req["uid"];
  const listName = req.params.listname;

  if (!listName) {
    res.status(400).json({
      success: false,
      error: "inviteCode is required",
    });
    return;
  }

  try {
    const status = await checkUserInviteStatus(userId, listName);

    res.send({
      success: true,
      data: status,
    });
  } catch (err) {
    log.error("Error fetching invite list status", err);
    res.status(500).send({
      success: false,
      error: "Error fetching invite list status",
    });
    return;
  }
});

const add_to_invite_list = asyncHandler(async (req, res, next) => {
  const userId = req["uid"];
  const listName = req.params.listname;

  if (!listName) {
    res.status(400).json({
      success: false,
      error: "inviteCode is required",
    });
    return;
  }

  try {
    await addEmailToInviteList(userId, listName);

    res.send({
      success: true,
    });
  } catch (err) {
    log.error("Error adding to invite list", err);
    res.status(500).send({
      success: false,
      error: "Error adding to invite list",
    });
    return;
  }
});

export default {
  check_user_verified,
  create_update_lnaddress,
  delete_lnaddress,
  get_account,
  get_user_public,
  edit_account,
  get_announcements,
  get_notification,
  put_notification,
  get_features,
  get_splits,
  get_tx_id,
  get_txs,
  get_check_region,
  post_log_identity,
  get_zbd_redirect_info,
  get_login_token_for_zbd_user,
  add_pubkey_to_account,
  delete_pubkey_from_account,
  get_pubkey_metadata,
  update_metadata,
  get_check_username,
  get_random_username,
  get_track_promos,
  create_user,
  create_user_verified,
  disable_user,
  get_inbox_lastread,
  put_inbox_lastread,
  get_invite_list_status,
  add_to_invite_list,
};

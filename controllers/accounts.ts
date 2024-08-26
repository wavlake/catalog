import db from "../library/db";
import {
  earnings,
  transactions,
  forwards,
  internalAmps,
  externalAmps,
  pendingForwards,
  getMaxAmpDate,
  getMaxTransactionDate,
} from "../library/queries/transactions";
import asyncHandler from "express-async-handler";
import prisma from "../prisma/client";
import log from "loglevel";
import { auth } from "../library/firebaseService";
import { validateLightningAddress } from "../library/zbd/zbdClient";
import { urlFriendly } from "../library/format";
import { upload_image } from "../library/artwork";
import { getZBDRedirectInfo, getZBDUserInfo } from "../library/zbd/login";
import { updateNpubMetadata } from "../library/nostr/nostr";

async function groupSplitPayments(combinedAmps) {
  // Group records by txId
  const grouped = combinedAmps.reduce((acc, curr) => {
    // User createdAt as identifier for legacy amps
    const identifier = curr.txId ? curr.txId : curr.createdAt;
    if (!acc[identifier]) {
      acc[identifier] = [];
    }
    acc[identifier].push(curr);
    return acc;
  }, {});

  // convert grouped to array
  return Object.keys(grouped).map((key) => grouped[key]);
}

const get_account = asyncHandler(async (req, res, next) => {
  const request = {
    accountId: req["uid"],
  };
  log.debug("get_account uid:", request.accountId);
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

  const notifyUser = await db
    .knex(getMaxAmpDate(request.accountId))
    .unionAll([getMaxTransactionDate(request.accountId)])
    .groupBy("created_at")
    .max("created_at")
    .first()
    .then((data) => {
      if (!data?.max) return false;

      const latestDate =
        latestAnnouncement > data.max ? latestAnnouncement : data.max;
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

const get_tx_id = asyncHandler(async (req, res, next) => {
  const userId = req["uid"];
  const { type, id } = req.params;

  res.json({ success: true, data: { id: id } });
});

const get_txs = asyncHandler(async (req, res, next) => {
  const userId = req["uid"];

  const { page } = req.params;
  const pageInt = parseInt(page);
  if (!Number.isInteger(pageInt) || pageInt <= 0) {
    res.status(400).json({
      success: false,
      error: "page must be a positive integer",
    });
    return;
  }

  const txs = await db
    .knex(transactions(userId))
    .unionAll([
      forwards(userId),
      earnings(userId),
      internalAmps(userId),
      externalAmps(userId),
      pendingForwards(userId),
    ])
    .orderBy("createDate", "desc")
    .paginate({
      perPage: 20,
      currentPage: pageInt,
      isLengthAware: true,
    });

  const txsModified = {};
  txs.data.forEach((tx) => {
    // Group records by createDate YYYY-MM-DD
    const createDate = new Date(tx.createDate);
    const date = `${tx.createDate.toLocaleString("default", {
      month: "long",
    })} ${createDate.getDate()}`;

    // Create date key if it doesn't exist and add tx to array
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

const create_account = asyncHandler(async (req, res, next) => {
  const { name, userId } = req.body;

  if (!name || !userId) {
    res.status(400).json({
      success: false,
      error: "Name and userId are required",
    });
    return;
  }

  try {
    const profileUrl = urlFriendly(name);
    const existingUser = await prisma.user.findUnique({
      where: {
        name: name,
      },
    });
    if (existingUser) {
      res.status(400).json({
        success: false,
        error: "Name is already taken",
      });
      return;
    }
    const newUser = await prisma.user.create({
      data: {
        id: userId,
        name: name,
        profileUrl,
      },
    });

    res.send({
      success: true,
      data: newUser,
    });
  } catch (err) {
    log.debug("error creating account", req.body);
    log.debug(err);
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
    // if updating name,  check if it's available
    if (name) {
      const existingUser = await prisma.user.findUnique({
        where: {
          name: name,
        },
      });
      if (existingUser && existingUser.id !== userId) {
        res.status(400).json({
          success: false,
          error: "Name is already taken",
        });
        return;
      }
      // generate profile url
      profileUrl = urlFriendly(name);
      if (profileUrl === "-") {
        profileUrl = "user-" + userId.slice(-5, -1);
      }
    }

    let cdnImageUrl;
    if (artwork) {
      cdnImageUrl = await upload_image(artwork, userId, "artist");
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
    log.debug("error editing account", { ...req.body, userId });
    log.debug(err);
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
      const existingUsername = await prisma.user.findFirst({
        where: {
          name: incomingUsername,
        },
      });

      // if the username is already taken, generate a new one, otherwise use the incoming username
      const username =
        existingUsername?.id || !incomingUsername
          ? `zbduser_${user.uid.split("").slice(0, 7).join("")}`
          : incomingUsername;

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
      log.debug("error getting firebase token for zbd user");
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
    log.debug("error getting zbd user data", err);
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
    log.debug("validating authToken");
    const user = await auth().verifyIdToken(authToken);
    log.debug("valid authToken for uid: ", user.uid);

    const existingPubkey = await prisma.userPubkey.findFirst({
      where: {
        pubkey,
      },
    });

    if (existingPubkey) {
      if (existingPubkey.userId === user.uid) {
        // pubkey is already associated with this user
        // no need to do anything
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
    log.debug("error adding pubkey to account", { pubkey });
    log.debug(err);
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
    log.debug("error deleting pubkey from account", { ...req.body, userId });
    log.debug(err);
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
    log.debug("error getting pubkey metadata", { pubkey });
    log.debug(err);
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
    log.debug("error updating pubkey metadata", { pubkey });
    log.debug(err);
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

export default {
  check_user_verified,
  create_update_lnaddress,
  delete_lnaddress,
  get_account,
  get_user_public,
  create_account,
  edit_account,
  get_announcements,
  get_notification,
  put_notification,
  get_features,
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
};

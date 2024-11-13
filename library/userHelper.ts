import prisma from "../prisma/client";
import db from "./db";
import log from "loglevel";
import Sentry from "@sentry/node";
import { upload_image } from "./artwork";
import { urlFriendly } from "./format";
import { toPng } from "jdenticon";
import { ResponseObject } from "../types/catalogApi";
import { uniqueNamesGenerator, colors, animals } from "unique-names-generator";
import fs from "fs";

export type SplitContentTypes =
  | "track"
  | "episode"
  | "podcast"
  | "album"
  | "artist";

export async function checkUserHasSufficientSats(
  userId: string,
  msatAmount: number
): Promise<boolean> {
  const inflightKeysends = await db
    .knex("external_payment")
    .sum("msat_amount as totalAmount")
    .sum("fee_msat as totalFee")
    .where("is_pending", "=", true)
    .andWhere("user_id", "=", userId)
    .groupBy("user_id")
    .first();
  const inflightTransactions = await db
    .knex("transaction")
    .sum("msat_amount as totalAmount")
    .sum("fee_msat as totalFee")
    .where("is_pending", "=", true)
    .andWhere("user_id", "=", userId)
    .groupBy("user_id")
    .first();

  const inFlightSats =
    parseInt(inflightKeysends?.totalAmount || 0) +
    parseInt(inflightKeysends?.totalFee || 0) +
    parseInt(inflightTransactions?.totalAmount || 0) +
    parseInt(inflightTransactions?.totalFee || 0);

  return db
    .knex("user")
    .select("user.msat_balance as msatBalance")

    .where("user.id", "=", userId)
    .first()
    .then((userData) => {
      if (!userData) {
        return false;
      }
      // adjust available balance and subtract any inflight sats
      return parseInt(userData.msatBalance) - inFlightSats > msatAmount;
    })
    .catch((err) => {
      log.debug(`Error querying user table: ${err}`);
      return false;
    });
}

export async function getUserBalance(userId: string): Promise<string> {
  return db
    .knex("user")
    .select("msat_balance as msatBalance")
    .where("id", "=", userId)
    .first()
    .then((data) => {
      return data.msatBalance;
    })
    .catch((err) => {
      log.error(`Error finding user from userId ${err}`);
    });
}

export async function getUserLightningAddress(
  userId: string
): Promise<string | undefined> {
  return db
    .knex("user")
    .select("lightning_address")
    .where("id", "=", userId)
    .first()
    .then((data) => {
      return data.lightning_address ?? undefined;
    })
    .catch((err) => {
      log.error(`Error finding lightning address from userId ${err}`);
    });
}

export async function getUserName(userId: string): Promise<string | undefined> {
  return db
    .knex("user")
    .select("name")
    .where("id", "=", userId)
    .first()
    .then((data) => {
      return data.name;
    })
    .catch((err) => {
      log.error(`Error finding user from userId ${err}`);
    });
}

export async function isContentOwner(
  userId: string,
  contentId: string,
  contentType: SplitContentTypes
): Promise<boolean> {
  switch (contentType) {
    case "track":
      return isTrackOwner(userId, contentId);
    case "episode":
      return isEpisodeOwner(userId, contentId);
    case "album":
      return isAlbumOwner(userId, contentId);
    case "podcast":
      return isPodcastOwner(userId, contentId);

    default:
      return false;
  }
}

export async function isTrackOwner(
  userId: string,
  trackId: string
): Promise<boolean> {
  return db
    .knex("track")
    .join("artist", "track.artist_id", "=", "artist.id")
    .join("user", "artist.user_id", "=", "user.id")
    .select("user.id as userId")
    .where("track.id", "=", trackId)
    .first()
    .then((data) => {
      return data.userId == userId;
    })
    .catch((err) => {
      Sentry.captureException(err);
      log.error(`Error finding user from trackId ${err}`);
      return false;
    });
}

export async function isEpisodeOwner(
  userId: string,
  episodeId: string
): Promise<boolean> {
  return db
    .knex("episode")
    .join("podcast", "episode.podcast_id", "=", "podcast.id")
    .join("user", "podcast.user_id", "=", "user.id")
    .select("user.id as userId")
    .where("episode.id", "=", episodeId)
    .first()
    .then((data) => {
      return data.userId == userId;
    })
    .catch((err) => {
      Sentry.captureException(err);
      log.error(`Error finding user from episodeId ${err}`);
      return false;
    });
}

export async function isAlbumOwner(
  userId: string,
  albumId: string
): Promise<boolean> {
  return db
    .knex("album")
    .join("artist", "album.artist_id", "=", "artist.id")
    .join("user", "artist.user_id", "=", "user.id")
    .select("user.id as userId")
    .where("album.id", "=", albumId)
    .first()
    .then((data) => {
      return data.userId == userId;
    })
    .catch((err) => {
      Sentry.captureException(err);
      log.error(`Error finding user from albumId ${err}`);
      return false;
    });
}

export async function isPodcastOwner(
  userId: string,
  podcastId: string
): Promise<boolean> {
  return db
    .knex("podcast")
    .select("podcast.user_id as userId")
    .where("id", "=", podcastId)
    .first()
    .then((data) => {
      // console.log(data);
      return data.userId == userId;
    })
    .catch((err) => {
      Sentry.captureException(err);
      log.error(`Error finding account from podcastId ${err}`);
      return false;
    });
}

export async function isArtistOwner(
  userId: string,
  artistId: string
): Promise<boolean> {
  return db
    .knex("artist")
    .select("artist.user_id as userId")
    .where("id", "=", artistId)
    .first()
    .then((data) => {
      // console.log(data);
      return data.userId == userId;
    })
    .catch((err) => {
      Sentry.captureException(err);
      log.error(`Error finding account from artistId ${err}`);
      return false;
    });
}

export async function isRegionVerified(userId: string): Promise<boolean> {
  return db
    .knex("user_verification")
    .select("user_id as userId")
    .where("user_id", "=", userId)
    .first()
    .then((data) => {
      return data ?? false;
    })
    .catch((err) => {
      Sentry?.captureException(err);
      log.error(
        `Error looking up user ${userId} in user_verifiation table: ${err}`
      );
      return false;
    });
}

export async function getCommentUser(commentId: string): Promise<any> {
  return db
    .knex("comment")
    .select("user_id as userId")
    .where("id", "=", commentId)
    .first()
    .then((data) => {
      // console.log(data)
      return data;
    })
    .catch((err) => {
      Sentry.captureException(err);
      log.error(`Error finding user from commentId ${err}`);
      return undefined;
    });
}

export async function isPlaylistOwner(
  userId: string,
  playlistId: string
): Promise<boolean> {
  return db
    .knex("playlist")
    .select("user_id as userId")
    .where("id", "=", playlistId)
    .first()
    .then((data) => {
      // console.log(data);
      return data.userId === userId;
    })
    .catch((err) => {
      Sentry.captureException(err);
      log.error(`Error finding user from playlistId ${err}`);
      return false;
    });
}

export const userOwnsContent = async (
  contentUserId: string,
  // this can be a firebase user id or a pubkey
  userId: string
) => {
  const userNpubsByUserId = await prisma.userPubkey.findMany({
    where: { userId: userId },
  });

  const userNpubsByPubkey = await prisma.userPubkey.findMany({
    where: { pubkey: userId },
  });

  return (
    contentUserId === userId ||
    [...userNpubsByUserId, ...userNpubsByPubkey].some(
      (n) => n.pubkey === contentUserId || n.userId === contentUserId
    )
  );
};

export const getUserIds = async (userId: string) => {
  const userNpubsByUserId = await prisma.userPubkey.findMany({
    where: { userId: userId },
  });

  const userNpubsByPubkey = await prisma.userPubkey.findMany({
    where: { pubkey: userId },
  });

  return [
    userId,
    ...userNpubsByUserId.map((n) => n.pubkey),
    ...userNpubsByPubkey.map((n) => n.userId),
  ];
};

export type UserResponse = ResponseObject<{
  uid: string;
  username: string;
  profileUrl: string;
  pubkey: string;
}>;

export type UserCreateRequest = {
  username?: string;
  pubkey?: string;
};

export type UserVerifiedRequest = UserCreateRequest & {
  firstName: string;
  lastName: string;
};

export type CreatedUser = {
  uid: string;
  username: string;
  profileUrl: string;
  pubkey?: string;
};

// userCreationService.ts
export async function validateAndGenerateUsername(
  providedUsername?: string
): Promise<string | null> {
  let username = providedUsername;
  if (!username) {
    username = await getRandomName();
  }

  const validUsername = await validateUsername(username);
  if (!validUsername) {
    return null;
  }

  const usernameOK = await usernameIsAvailable(username);
  if (!usernameOK) {
    return null;
  }

  return username;
}

export async function generateAndUploadAvatar(
  userId: string,
  username: string
): Promise<string | undefined> {
  const avatar = toPng(username, 300);
  fs.writeFileSync(`/tmp/${userId}.png`, avatar);
  const avatarFile = fs.createReadStream(`/tmp/${userId}.png`);

  if (avatar) {
    return await upload_image(avatarFile, userId, "user");
  }
  return undefined;
}

export async function createBaseUser(
  userId: string,
  username: string,
  cdnImageUrl?: string
) {
  return await prisma.user.create({
    data: {
      id: userId,
      name: username,
      profileUrl: urlFriendly(username),
      artworkUrl: cdnImageUrl,
    },
  });
}

export async function createUserPubkey(userId: string, pubkey?: string) {
  if (!pubkey) return null;

  return await prisma.userPubkey.create({
    data: {
      userId: userId,
      pubkey: pubkey,
      createdAt: new Date(),
    },
  });
}

export async function createUserVerification(
  userId: string,
  firstName?: string,
  lastName?: string,
  ip?: string
) {
  if (!firstName || !lastName) return null;

  return await prisma.userVerification.create({
    data: {
      userId: userId,
      firstName: firstName,
      lastName: lastName,
      ip: ip,
    },
  });
}

export function formatUserResponse(
  userId: string,
  username: string,
  profileUrl: string,
  pubkey?: string
) {
  return {
    uid: userId,
    username: username,
    profileUrl: profileUrl,
    pubkey: pubkey,
  };
}

// Optional: Compose functions for common operations
export const createUserWithAvatar = async (
  userId: string,
  username: string
) => {
  const cdnImageUrl = await generateAndUploadAvatar(userId, username);
  return await createBaseUser(userId, username, cdnImageUrl);
};

export function makeRandomName() {
  return uniqueNamesGenerator({
    dictionaries: [colors, animals],
    separator: "-", // word separator
  }); // example: red-donkey
}

export async function validateUsername(username: string): Promise<boolean> {
  // Name should only contain letters, numbers, underscores, and hyphens
  return /^[A-Za-z0-9_-]+$/.test(username);
}

export async function usernameIsAvailable(name: string): Promise<boolean> {
  const profileUrl = urlFriendly(name);

  // username or profileUrl matches
  const userExists = await prisma.user.findFirst({
    where: {
      OR: [{ name: name }, { profileUrl }],
    },
  });

  return userExists ? false : true;
}

export async function getRandomName(): Promise<string> {
  let newUserName: string;
  let userExists;
  // generate a random name until we find one that doesn't exist
  const MAX_ATTEMPTS = 10;
  let attempts = 0;
  while (!newUserName && attempts < MAX_ATTEMPTS) {
    newUserName = makeRandomName();
    const profileUrl = urlFriendly(newUserName);

    // username matches or profileUrl
    userExists = await prisma.user.findFirst({
      where: {
        OR: [{ name: newUserName }, { profileUrl }],
      },
    });

    attempts++;
    if (!userExists) {
      return newUserName;
    }
    return null;
  }
}

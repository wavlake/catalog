require("dotenv").config();
require("websocket-polyfill");
import log, { LogLevelDesc } from "loglevel";

import prisma from "@prismalocal/client";
import {
  getFollowersList,
  getFollowsList,
  getProfileMetadata,
} from "@library/nostr/nostr";
import express from "express";
import { Prisma } from "@prisma/client";

interface NpubMetadata {
  publicHex: string;
  metadata: Prisma.JsonValue;
  followerCount: number;
  follows: Prisma.JsonValue;
}

log.setLevel((process.env.LOGLEVEL as LogLevelDesc) ?? "info");
const app = express();

const checkPublicKey = async (
  publicHex: string
): Promise<NpubMetadata | undefined> => {
  try {
    const npub = await prisma.npub.findUnique({
      where: { publicHex },
      select: {
        updatedAt: true,
        publicHex: true,
        metadata: true,
        followerCount: true,
        follows: true,
      },
    });

    // 24 hours
    const STALE_TIME = 86400000;
    const npubUpdatedRecently =
      npub?.updatedAt &&
      new Date().getTime() - npub.updatedAt.getTime() < STALE_TIME;

    if (npubUpdatedRecently) {
      log.debug("Skipping check, metadata was recently updated");
      return npub;
    }

    // update the timestamp first so we don't have back to back requests updating the same npub
    await prisma.npub.upsert({
      where: { publicHex: publicHex },
      update: {
        updatedAt: new Date(),
      },
      create: {
        publicHex: publicHex,
        updatedAt: new Date(),
      },
    });

    log.debug(`Retrieving metadata for: ${publicHex}`);

    // TODO - get relay list from nip-05
    const latestMetadataEvent = await getProfileMetadata(publicHex);
    const latestMetadata = JSON.parse(latestMetadataEvent.content);

    const followers = await getFollowersList(publicHex);
    const follows = await getFollowsList(publicHex);
    log.debug(`Updating DB: ${latestMetadata.name} ${publicHex}`);
    const updatedData = await prisma.npub.upsert({
      where: { publicHex: publicHex },
      update: {
        metadata: latestMetadata,
        updatedAt: new Date(),
        followerCount: followers.length,
        follows: follows,
      },
      create: {
        publicHex: publicHex,
        metadata: latestMetadata,
        updatedAt: new Date(),
        followerCount: followers.length,
        follows: follows,
      },
    });
    return updatedData;
  } catch (e) {
    console.log("error: ", e);
    return undefined;
  }
};

app.put("/:publicHex", async (req, res) => {
  const publicHex = req.params.publicHex;
  const metadata = await checkPublicKey(publicHex);
  res.send({
    success: !!metadata,
    data: metadata,
  });
});

const port = parseInt(process.env.PORT) || 8080;
export const server = app.listen(port, () => {
  console.log(`npub-metadata listening on port ${port}`);
});

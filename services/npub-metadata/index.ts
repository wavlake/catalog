require("dotenv").config();
require("websocket-polyfill");
import log, { LogLevelDesc } from "loglevel";

import prisma from "@prismalocal/client";
import {
  DEFAULT_READ_RELAY_URIS,
  getProfileMetadata,
} from "@library/nostr/nostr";
import express from "express";
import { Filter, SimplePool, nip05 } from "nostr-tools";
import { Prisma } from "@prisma/client";

log.setLevel((process.env.LOGLEVEL as LogLevelDesc) ?? "info");
const app = express();

const checkPublicKey = async (publicHex: string): Promise<boolean> => {
  try {
    const npub = await prisma.npub.findUnique({
      where: { publicHex },
    });

    // 24 hours
    const STALE_TIME = 86400000;
    const npubUpdatedRecently =
      npub?.updatedAt &&
      new Date().getTime() - npub.updatedAt.getTime() < STALE_TIME;

    if (npubUpdatedRecently) {
      log.debug("Skipping check, metadata was recently updated");
      return true;
    }

    log.debug(`Retrieving metadata for: ${publicHex}`);

    // TODO - get relay list from nip-05
    const latestMetadataEvent = await getProfileMetadata(publicHex);
    const latestMetadata = JSON.parse(latestMetadataEvent.content);

    const followerCount = await checkFollowerCount(publicHex);
    const follows = await getFollowsList(publicHex);
    log.debug(`Updating DB: ${latestMetadata.name} ${publicHex}`);
    await prisma.npub.upsert({
      where: { publicHex: publicHex },
      update: {
        metadata: latestMetadata,
        updatedAt: new Date(),
        followerCount: followerCount,
        follows: follows,
      },
      create: {
        publicHex: publicHex,
        metadata: latestMetadata,
        updatedAt: new Date(),
        followerCount: followerCount,
        follows: follows,
      },
    });
    return true;
  } catch (e) {
    console.log("error: ", e);
    return false;
  }
};

const checkFollowerCount = async (publicHex: string): Promise<number> => {
  const pool = new SimplePool();
  const filter: Filter = {
    kinds: [3],
    ["#p"]: [publicHex],
  };
  const events = await pool.querySync(DEFAULT_READ_RELAY_URIS, filter);
  const count = events.length;

  return count;
};

interface Follow extends Prisma.JsonArray {
  pubkey: string;
  relay?: string;
  petname?: string;
}

const getFollowsList = async (publicHex: string): Promise<Follow[]> => {
  const pool = new SimplePool();
  const filter: Filter = {
    kinds: [3],
    authors: [publicHex],
    limit: 1,
  };

  const event = await pool.get(DEFAULT_READ_RELAY_URIS, filter);
  if (!event?.tags.length) {
    return [];
  }

  const followsList = event.tags.reduce(
    (acc, [tag, pubkey, relay, petname]) => {
      if (tag === "p") {
        return acc.concat([{ pubkey, relay, petname } as Follow]);
      }
      return acc;
    },
    [] as Follow[]
  );

  return followsList;
};

app.put("/:publicHex", async (req, res) => {
  const publicHex = req.params.publicHex;
  const isSuccess = await checkPublicKey(publicHex);

  res.send({
    isSuccess,
  });
});

const port = parseInt(process.env.PORT) || 8080;
export const server = app.listen(port, () => {
  console.log(`npub-metadata listening on port ${port}`);
});

require("dotenv").config();
require("websocket-polyfill");
const log = require("loglevel");
log.setLevel(process.env.LOGLEVEL);

import prisma from "@prismalocal/client";
import { getProfileMetadata } from "@library/nostr/nostr";
import express from "express";

const app = express();

const checkPublicKey = async (publicHex: string): Promise<boolean> => {
  try {
    const npub = await prisma.npub.findUnique({
      where: { public_hex: publicHex },
    });

    // 24 hours
    const STALE_TIME = 86400000;
    const npubUpdatedRecently =
      npub?.updated_at &&
      new Date().getTime() - npub.updated_at.getTime() < STALE_TIME;

    if (npubUpdatedRecently) {
      log.debug("Skipping check, metadata was checked within the last hour");
      return true;
    }

    log.debug(`Retrieving metadata for: ${publicHex}`);

    // TODO - get relay list from nip-05
    const latestMetadataEvent = await getProfileMetadata(publicHex);
    const latestMetadata = JSON.parse(latestMetadataEvent.content);

    log.debug(`Updating DB: ${latestMetadata.name} ${publicHex}`);
    await prisma.npub.upsert({
      where: { public_hex: publicHex },
      update: {
        metadata: latestMetadata,
        updated_at: new Date(),
      },
      create: {
        public_hex: publicHex,
        metadata: latestMetadata,
        updated_at: new Date(),
      },
    });
    return true;
  } catch (e) {
    console.log("error: ", e);
    return false;
  }
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

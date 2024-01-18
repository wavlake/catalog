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
    // TODO - get relay list from nip-05
    const latestMetadataEvent = await getProfileMetadata(publicHex);
    const latestMetadata = JSON.parse(latestMetadataEvent.content);

    await prisma.npub.upsert({
      where: { public_hex: publicHex },
      update: {
        metadata: latestMetadata,
        updated_at: new Date(latestMetadataEvent.created_at * 1000),
      },
      create: {
        public_hex: publicHex,
        metadata: latestMetadata,
        updated_at: new Date(latestMetadataEvent.created_at * 1000),
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
  log.debug(`Updating metadata for: ${publicHex}`);
  const isSuccess = await checkPublicKey(publicHex);

  log.debug(
    isSuccess ? "Successfully updated metadata" : "Failed to update metadata"
  );
  res.send({
    isSuccess,
  });
});

const port = parseInt(process.env.PORT) || 8080;
export const server = app.listen(port, () => {
  console.log(`npub-metadata listening on port ${port}`);
});

require("dotenv").config();
require("websocket-polyfill");
const log = require("loglevel");
log.setLevel(process.env.LOGLEVEL);
import podcastIndex from "podcast-index-api";
import prisma from "@prismalocal/client";
import { getProfileMetadata } from "@library/nostr/nostr";
const checkPublicKey = async (publicHex: string) => {
  try {
    const latestMetadataEvent = await getProfileMetadata(publicHex);
    const latestMetadata = JSON.parse(latestMetadataEvent.content);

    console.log("updating metadata");
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
    console.log("updated metadata");
  } catch (e) {
    console.log("error", e);
  }
};

// TODO figure out how cloud run passes in arguments from an incoming request
checkPublicKey(
  "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2"
);

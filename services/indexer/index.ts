require("dotenv").config();
import log, { LogLevelDesc } from "loglevel";
log.setLevel(process.env.LOGLEVEL as LogLevelDesc);
import { getPublicKey, finalizeEvent, UnsignedEvent } from "nostr-tools";
const { useWebSocketImplementation, SimplePool } = require("nostr-tools/pool");
import {
  getContentFromId,
  getParentContentTypeAndId,
  getType,
} from "@library/content";
const {
  feedPath,
  receivingPublicKey,
  podcastNamespace,
  valueRecipient,
  valueTimeSplit,
} = require("@library/rssUtils");
const { v5, validate } = require("uuid");
import { DEFAULT_READ_RELAY_URIS } from "@library/nostr/common";
import { hexToBytes } from "@noble/hashes/utils"; // already an installed dependency
useWebSocketImplementation(require("ws"));
const { webcrypto } = require("node:crypto");
globalThis.crypto = webcrypto;
const knex = require("knex")({
  client: "sqlite3",
  connection: {
    filename: "./db/data.sqlite3",
  },
});
const argv = require("minimist")(process.argv.slice(2));
const startTimestamp = argv["t"];

const pool = new SimplePool();
const relayUris = DEFAULT_READ_RELAY_URIS;
const walletSk = process.env.WALLET_SERVICE_SECRET;

const walletSkBytes = hexToBytes(walletSk);
const walletServicePubkey = getPublicKey(walletSkBytes);

// Check if we are in historical mode
let isHistoricalRun = false;
if (startTimestamp) {
  isHistoricalRun = true;
  log.info(
    `****HISTORICAL MODE****: Starting from timestamp: ${startTimestamp}`
  );
} else {
  log.info(`Running standard indexer...`);
}

// Main process
const main = async () => {
  log.debug("Starting to monitor for Wavlake content id events...");
  if (!walletSk) {
    throw new Error("No wallet service SK found");
  }

  const latestRunTimestamp = await getLatestRunTimestamp();
  log.debug(`Latest run timestamp: ${latestRunTimestamp}`);

  pool.subscribeMany(
    relayUris,
    [
      {
        kinds: [1],
        ...(!isHistoricalRun && latestRunTimestamp
          ? {
              since: latestRunTimestamp + 1,
            }
          : {}),
        ...(isHistoricalRun ? { since: startTimestamp, until: startTimestamp + 86400  } : {}),
        // since: 1721105864,
        // until: 1721192264,
      },
    ],
    {
      onevent: (event: any) => {
        // log.debug("Received event");
        // log.debug(`Received event: ${JSON.stringify(event)}`);
        // this will only be called once the first time the event is received
        checkEvent(event);
      },
      oneose: () => {
        log.debug("One or more subscriptions have ended");
        // sub.close();
      },
    }
  );
};

const getLatestRunTimestamp = async () => {
  const latestRunTimestamp = await knex("run_log").max(
    "updated_at as updated_at"
  );
  if (latestRunTimestamp.length === 0) {
    return null;
  }
  return latestRunTimestamp[0].updated_at;
};

const checkEvent = async (event: any) => {
  if (event.kind === 1 && event.content.includes("wavlake.com")) {
    const eventContent = event.content;
    log.debug(`Found Wavlake link...`);
    log.debug(`Event content: ${eventContent}`);
    // Look for a uuid in the content
    const uuidMatch = eventContent.match(
      /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/
    );
    if (!uuidMatch) {
      log.debug("No uuid found in content");
      return;
    }
    log.debug(`Found uuid: ${uuidMatch[0]}`);
    const contentId = uuidMatch[0];
    // log.debug(`Found uuid: ${contentId}`);
    // Fetch the content id
    const wavlakeContent = await getContentFromId(contentId);
    // Send the content to the wallet service
    if (wavlakeContent) {
      // log.debug(`Found content: ${JSON.stringify(wavlakeContent)}`);
      const contentType = await getType(contentId);
      const parentContentData = await getParentContentTypeAndId(contentId);
      await publishLabelEvent(
        event.id,
        contentId,
        contentType,
        parentContentData,
        event.created_at
      );
      return;
    }
  }
};

const publishLabelEvent = async (
  referencedEventId: string,
  contentId: string,
  contentType: string,
  parentContentData: any,
  eventCreatedAt: number
) => {
  log.debug(`Constructing label event for content id: ${contentId}`);
  const namespace = await generateNamespace(contentType);
  const itemLabel = await generateIdentifier(contentId, contentType);
  const parentItemLabel = await generateIdentifier(
    parentContentData.parentId,
    parentContentData.contentType
  );

  const eventTemplate: UnsignedEvent = {
    kind: 1985,
    pubkey: walletServicePubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["L", namespace],
      ["l", itemLabel, namespace],
      ["e", referencedEventId],
      ["i", itemLabel],
      ...(parentItemLabel ? [["i", parentItemLabel]] : []),
    ],
    content: "",
  };
  const signedEvent = finalizeEvent(eventTemplate, walletSkBytes);
  await Promise.any(pool.publish(relayUris, signedEvent));
  log.debug(`Published label event: ${JSON.stringify(signedEvent)}`);
  // Update the run log with the original event timestamp if this is a normal run
  if (!isHistoricalRun) {
    await knex("run_log").insert({
      updated_at: eventCreatedAt,
    });
  }
  return;
};

const generateNamespace = async (contentType: string) => {
  if (contentType === "track" || contentType === "episode") {
    return `podcast:item:guid`;
  } else if (contentType === "album" || contentType === "podcast") {
    return `podcast:guid`;
  } else if (contentType === "artist") {
    return `podcast:publisher:guid`;
  } else {
    log.debug(`Unknown content type: ${contentType}`);
    return;
  }
};

const generateIdentifier = async (contentId: string, contentType: string) => {
  if (contentType === "track" || contentType === "episode") {
    return `podcast:item:guid:${contentId}`;
  } else if (contentType === "album" || contentType === "podcast") {
    return `podcast:guid:${v5(
      feedPath(contentType, contentId),
      podcastNamespace
    )}`;
  } else if (contentType === "artist") {
    return `podcast:publisher:guid:${contentId}`;
  } else {
    log.debug(`Unknown content type: ${contentType}`);
    return;
  }
};
main().catch((err) => log.error(err));

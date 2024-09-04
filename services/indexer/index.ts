require("dotenv").config();
import log, { LogLevelDesc } from "loglevel";
log.setLevel(process.env.LOGLEVEL as LogLevelDesc);
import { getPublicKey, Relay, nip04 } from "nostr-tools";
const { useWebSocketImplementation, SimplePool } = require("nostr-tools/pool");
import { getContentFromId } from "@library/content";
import { DEFAULT_READ_RELAY_URIS } from "@library/nostr/common";
import { hexToBytes } from "@noble/hashes/utils"; // already an installed dependency
useWebSocketImplementation(require("ws"));
const { webcrypto } = require("node:crypto");
globalThis.crypto = webcrypto;

const pool = new SimplePool();
const relayUris = DEFAULT_READ_RELAY_URIS;
const walletSk = process.env.WALLET_SERVICE_SECRET;

const walletSkHex = hexToBytes(walletSk);
const walletServicePubkey = getPublicKey(walletSkHex);

// Main process
const main = async () => {
  log.debug("Starting to monitor for Wavlake content id events");
  if (!walletSk) {
    throw new Error("No wallet service SK found");
  }
  const sub = pool.subscribeMany(
    relayUris,
    [
      {
        kinds: [1],
        // since: 1721105864,
        // until: 1721192264,
      },
    ],
    {
      onevent: (event: any) => {
        // log.debug("Received event");
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

const checkEvent = async (event: any) => {
  if (event.kind === 1) {
    const content = event.content;
    // See if a wavlake.com link is in the content
    if (content.includes("wavlake.com")) {
      log.debug(`Found Wavlake link...`);
      // Look for a uuid in the content
      const uuid = content.match(
        /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/
      )[0];
      log.debug(`Found uuid: ${uuid}`);
      // Fetch the content id
      const wavlakeContent = await getContentFromId(uuid);
      // Send the content to the wallet service
      if (wavlakeContent) {
        log.debug(`Found content: ${JSON.stringify(wavlakeContent)}`);
      }
    }
  }
};

main().catch((err) => log.error(err));

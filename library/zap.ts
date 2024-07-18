import db from "./db";
import log from "loglevel";
import {
  SimplePool,
  finalizeEvent,
  useWebSocketImplementation,
  Relay,
} from "nostr-tools";
import { hexToBytes } from "@noble/hashes/utils";
useWebSocketImplementation(require("ws"));
import { handleConferenceZap } from "./btc24/btc24";
const { DEFAULT_WRITE_RELAY_URIS } = require("./nostr/common");

const WAVLAKE_RELAY = process.env.WAVLAKE_RELAY;
const WAVLAKE_SECRET = hexToBytes(process.env.NOSTR_SECRET);

export const logZapRequest = async (
  paymentHash: string,
  eventId: string,
  event: string
) => {
  return db
    .knex("zap_request")
    .insert({ payment_hash: paymentHash, event_id: eventId, event: event })
    .catch((err) => {
      throw new Error(`Error inserting zap request: ${err}`);
    });
};

export const getZapPubkeyAndContent = async (invoiceId: number) => {
  const paymentHash = `external_receive-${invoiceId}`;
  const zapRequestEvent = await db
    .knex("zap_request")
    .where("payment_hash", paymentHash)
    .first()
    .then((data) => {
      return data.event;
    })
    .catch((err) => {
      throw new Error(`Error getting zap pubkey and comment: ${err}`);
    });

  let parsedZap;
  try {
    parsedZap = JSON.parse(zapRequestEvent);
  } catch (e) {
    log.error(`Error parsing zap event: ${e}`);
    return null;
  }

  return {
    zapRequest: parsedZap,
    pubkey: parsedZap.pubkey,
    content: parsedZap.content,
    timestamp: parsedZap.tags?.timestamp,
  };
};

interface ZapRequestEvent {
  content: string;
  tags: [string, string][];
}

export const publishPartyReceipt = async (trackId: string) => {
  const relay = await Relay.connect(WAVLAKE_RELAY);
  let event = {
    kind: 21012,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["wavlakePartyTrackId", trackId]],
    content: `${trackId}`,
  };

  const signedEvent = finalizeEvent(event, WAVLAKE_SECRET);

  // Publish to Wavlake relay
  relay.publish(signedEvent).catch((e) => {
    log.error(`Error issuing party receipt: ${e}`);
  });
  return;
};

export const publishZapReceipt = async (
  zapRequestEvent: ZapRequestEvent,
  paymentRequest: string,
  preimage: string,
  txId: string
) => {
  // const aTag = zapRequestEventObj.tags.find((x) => x[0] === "a");

  const eTag = zapRequestEvent.tags.find((x) => x[0] === "e");
  const aTag = zapRequestEvent.tags.find((x) => x[0] === "a");
  const pTag = zapRequestEvent.tags.find((x) => x[0] === "p");
  const iTags = zapRequestEvent.tags.filter((x) => x[0] === "i");
  ///////// TEMPORARY /////////

  ///////// TEMPORARY - REMOVE AFTER 240728 /////////
  const hashtag = zapRequestEvent.tags.find((x) => x[0] === "t");
  const btc24Tag = hashtag && hashtag[1] === "btc24jukebox";

  if (btc24Tag) {
    handleConferenceZap(zapRequestEvent);
  }
  //////////

  if (!aTag && !eTag) {
    log.error("No e or a tag found");
  }

  let zapReceipt = {
    kind: 9735,
    created_at: Math.round(Date.now() / 1000),
    tags: [
      ["bolt11", paymentRequest],
      ["description", JSON.stringify(zapRequestEvent)],
      ["preimage", preimage],
      ...(pTag ? [pTag] : []),
      ...(aTag ? [aTag] : []),
      ...(eTag ? [eTag] : []),
      ...(hashtag ? [hashtag] : []),
      ...(iTags.length > 0 ? iTags : []),
    ],
    content: "",
  };

  const signedEvent = finalizeEvent(zapReceipt, WAVLAKE_SECRET);

  // Publish to all relays
  const pool = new SimplePool();
  let relays = DEFAULT_WRITE_RELAY_URIS;
  Promise.any(pool.publish(relays, signedEvent))
    .then(() => {
      log.debug(`Published zap receipt for ${paymentRequest}`);
      // Log zap receipt event id
      db.knex("comment")
        .where({ tx_id: txId })
        .update({ zap_receipt_id: signedEvent.id })
        .then(() => {
          log.debug(`Logged zap receipt event id for txId: ${txId}`);
        })
        .catch((e) => {
          log.error(`Error logging zap receipt event id: ${e}`);
        });
      return;
    })
    .catch((e) => {
      log.error(`Error issuing zap receipt: ${e}`);
      return;
    });
  return;
};

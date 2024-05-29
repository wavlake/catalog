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
  preimage: string
) => {
  // const aTag = zapRequestEventObj.tags.find((x) => x[0] === "a");

  const eTag = zapRequestEvent.tags.find((x) => x[0] === "e");
  const aTag = zapRequestEvent.tags.find((x) => x[0] === "a");
  const pTag = zapRequestEvent.tags.find((x) => x[0] === "p");

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
    ],
    content: "",
  };

  // log.debug(`Signing zap receipt: ${JSON.stringify(zapReceipt)}`);

  const signedEvent = finalizeEvent(zapReceipt, WAVLAKE_SECRET);

  // Publish to all relays
  const pool = new SimplePool();
  let relays = DEFAULT_WRITE_RELAY_URIS;
  Promise.any(pool.publish(relays, signedEvent))
    .then((result) => {
      log.debug(`Published zap receipt: ${result}`);
      return;
    })
    .catch((e) => {
      log.error(`Error issuing zap receipt: ${e}`);
      return;
    });
  return;
};

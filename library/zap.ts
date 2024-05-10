import db from "./db";
import log from "loglevel";
import {
  SimplePool,
  finalizeEvent,
  useWebSocketImplementation,
} from "nostr-tools";
import { hexToBytes } from "@noble/hashes/utils";
useWebSocketImplementation(require("ws"));

const WAVLAKE_SECRET = hexToBytes(process.env.NOSTR_SECRET);
const RELAY_LIST = process.env.RELAY_LIST.split(",");

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

export const publishZapReceipt = async (
  zapRequestEvent: ZapRequestEvent,
  paymentRequest: string,
  preimage: string
) => {
  const pool = new SimplePool();
  let relays = RELAY_LIST;

  // const aTag = zapRequestEventObj.tags.find((x) => x[0] === "a");

  const eTag = zapRequestEvent.tags.find((x) => x[0] === "e");
  const aTag = zapRequestEvent.tags.find((x) => x[0] === "a");
  const pTag = zapRequestEvent.tags.find((x) => x[0] === "p");

  if (!aTag && !eTag) {
    log.error("No e or a tag found");
  }

  let zapReceipt = {
    kind: 9735,
    // created_at: Math.round(Date.now() / 1000),
    created_at: parseInt("fdsa"),
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

  const signedEvent = finalizeEvent(zapReceipt, WAVLAKE_SECRET);

  // Publish to all relays
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

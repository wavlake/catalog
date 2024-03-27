import db from "./db";
import log from "loglevel";
const { finishEvent, getPublicKey, relayInit } = require("nostr-tools");

const WAVLAKE_SECRET = process.env.NOSTR_SECRET;
const WAVLAKE_PUBKEY = getPublicKey(WAVLAKE_SECRET);
const RELAY = process.env.RELAY_URL;

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
  preimage: string,
  settledAt: string
) => {
  // const relay = relayInit(RELAY);
  // relay.on("connect", () => {
  //   log.debug(`connected to ${relay.url}`);
  // });
  // relay.on("error", () => {
  //   log.debug(`failed to connect to ${relay.url}`);
  // });

  // await relay.connect();
  // const eTag = zapRequestEvent.tags.find((x) => x[0] === "e");
  // const aTag = zapRequestEvent.tags.find((x) => x[0] === "a");
  // const pTag = zapRequestEvent.tags.find((x) => x[0] === "p");

  // if (!aTag && !eTag) {
  //   log.error("No e or a tag found");
  // }

  // let event = {
  //   kind: 9735,
  //   pubkey: WAVLAKE_PUBKEY,
  //   created_at: parseInt(settledAt),
  //   tags: [
  //     ["bolt11", paymentRequest],
  //     ["description", JSON.stringify(zapRequestEvent)],
  //     ["preimage", preimage],
  //     ...(pTag ? [pTag] : []),
  //     ...(aTag ? [aTag] : []),
  //     ...(eTag ? [eTag] : []),
  //   ],
  //   content: "",
  // };

  // log.debug(event);
  // const signedEvent = finishEvent(event, WAVLAKE_SECRET);

  // // log.debug(event);

  // await relay.publish(signedEvent);
  log.debug("TODO: Publish zap receipt");
};

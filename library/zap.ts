import db from "./db";
import log from "./winston";
import {
  SimplePool,
  finalizeEvent,
  Relay,
  verifyEvent,
  Event,
  useWebSocketImplementation,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools";
import { hexToBytes } from "@noble/hashes/utils";
import { handleConferenceZap } from "./btc24/btc24";
import { IncomingInvoiceTableMap, IncomingInvoiceType } from "./common";
import { makeZapReceipt, makeZapRequest } from "nostr-tools/lib/types/nip57";

const { DEFAULT_WRITE_RELAY_URIS } = require("./nostr/common");

const WAVLAKE_RELAY = process.env.WAVLAKE_RELAY;
const WAVLAKE_SECRET = hexToBytes(process.env.NOSTR_SECRET);

useWebSocketImplementation(require("ws"));

export const validateNostrZapRequest = ({
  nostr,
  amount,
  requireAOrETag = false,
}: {
  nostr: string;
  amount: string;
  requireAOrETag?: boolean;
}): { isValid: boolean; error?: string; zapRequestEvent?: Event } => {
  log.info(`Validating zap request: ${nostr}`);
  let zapRequestEvent: Event;
  try {
    zapRequestEvent = JSON.parse(nostr);
    if (!verifyEvent(zapRequestEvent) || zapRequestEvent.kind !== 9734) {
      return { isValid: false, error: "Invalid zap request event" };
    }
  } catch (e) {
    return { isValid: false, error: e || "Invalid nostr object" };
  }

  // https://github.com/nostr-protocol/nips/blob/master/57.md#appendix-a-zap-request-event
  const eTag = zapRequestEvent.tags.find((x) => x[0] === "e");
  const aTag = zapRequestEvent.tags.find((x) => x[0] === "a");
  if (requireAOrETag && !aTag && !eTag) {
    return {
      isValid: false,
      error: "Event must include either an a tag or an e tag.",
    };
  }

  const [amountTag, amountTagValue] =
    zapRequestEvent.tags.find((x) => x[0] === "amount") ?? [];
  if (!amountTagValue || parseInt(amount) !== parseInt(amountTagValue)) {
    log.info("Invalid zap request amount: ", amountTagValue);
    log.info("Invoice amount: ", amount);
    // we continue here because we want to allow the zap to go through
    // some clients may not include the amount tag
  }

  return { isValid: true, zapRequestEvent };
};

export const getZapPubkeyAndContent = async (
  invoiceId: number,
  invoiceType = IncomingInvoiceType.ExternalReceive
) => {
  const paymentHash = `${IncomingInvoiceTableMap[invoiceType]}-${invoiceId}`;
  const zapRequestEvent = await db
    .knex("zap_request")
    .where("payment_hash", paymentHash)
    .first()
    .then((data) => {
      return data?.event || null;
    })
    .catch((err) => {
      throw new Error(`Error getting zap pubkey and comment: ${err}`);
    });

  if (!zapRequestEvent) {
    console.log(
      `No zap request found for invoiceId: ${invoiceId} type: ${invoiceType}`
    );

    return null;
  }

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
  zapRequestEvent: Event,
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
  try {
    await Promise.any(pool.publish(relays, signedEvent));
    log.info(`Published zap receipt for ${paymentRequest}`);
    // Log zap receipt event id
    return db
      .knex("comment")
      .where({ tx_id: txId })
      .update({ zap_event_id: signedEvent.id })
      .then(() => {
        log.info(`Logged zap receipt event id for txId: ${txId}`);
      })
      .catch((e) => {
        log.error(`Error logging zap receipt event id: ${e}`);
      });
  } catch (e) {
    log.error(`Error issuing zap receipt: ${e}`);
    return;
  }
};

export const publishAnonZapReceipt = async ({
  paymentRequest,
  preimage,
  amount,
  description,
}: {
  paymentRequest: string;
  preimage: string;
  amount: string;
  description: string;
}): Promise<boolean> => {
  log.info(
    `Publishing anon zap receipt for ${JSON.stringify({
      paymentRequest,
      preimage,
      amount,
      description,
    })}`
  );
  const anonKey = generateSecretKey();
  const anonPubkey = getPublicKey(anonKey);
  const anonZapRequest = makeZapRequest({
    profile: anonPubkey,
    amount: parseInt(amount),
    comment: description,
    relays: [],
    event: null,
  });
  const zapReceipt = makeZapReceipt({
    zapRequest: JSON.stringify(anonZapRequest),
    bolt11: preimage,
    paidAt: new Date(),
  });

  const signedZapReceipt = finalizeEvent(zapReceipt, WAVLAKE_SECRET);

  // publish zap receipt to nostr
  const pool = new SimplePool();
  let relays = DEFAULT_WRITE_RELAY_URIS;
  try {
    await Promise.any(pool.publish(relays, signedZapReceipt));
    log.info(
      `Published anon zap receipt id: ${signedZapReceipt.id} for ${paymentRequest}`
    );
    return true;
  } catch (e) {
    log.error(`Error issuing zap receipt: ${e}`);
    return false;
  }
  // Log zap receipt event id
};

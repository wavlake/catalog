import db from "./db";
import log from "loglevel";

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
  };
};

export const publishZapReceipt = async (invoiceId, receipt) => {
  return db
    .knex("zap_receipt")
    .insert({ payment_hash: `external_receive-${invoiceId}`, receipt: receipt })
    .catch((err) => {
      throw new Error(`Error inserting zap receipt: ${err}`);
    });
};

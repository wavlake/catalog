import db from "./db";

export const logZapRequest = async (paymentHash, eventId, event) => {
  return db
    .knex("zap_request")
    .insert({ payment_hash: paymentHash, event_id: eventId, event: event })
    .catch((err) => {
      throw new Error(`Error inserting zap request: ${err}`);
    });
};

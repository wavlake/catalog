import {
  getPublicKey,
  verifyEvent,
  finalizeEvent,
  nip04,
  Relay,
} from "nostr-tools";
import { hexToBytes } from "@noble/hashes/utils"; // already an installed dependency
const log = require("loglevel");
log.setLevel(process.env.LOGLEVEL);
const { getWalletUser } = require("./wallet");

const relayUrl = process.env.WAVLAKE_RELAY;
const walletSk = hexToBytes(process.env.WALLET_SERVICE_SECRET);
const walletServicePubkey = getPublicKey(walletSk);

const validateEventAndGetUser = async (event) => {
  const isValid = verifyEvent(event);
  if (!isValid) return;

  const requesterPubkey = event.pubkey;
  log.debug(`Received valid event from ${requesterPubkey}`);

  const walletUser = await getWalletUser(requesterPubkey);
  return walletUser;
};

// Broadcast event response
const broadcastEventResponse = async (
  requesterPubkey,
  requestEventId,
  content
) => {
  const encryptedContent = await nip04.encrypt(
    walletSk, // sender secret
    requesterPubkey, // receiver pubkey
    content
  );

  let event = {
    kind: 23195,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["p", requesterPubkey],
      ["e", requestEventId],
    ],
    content: encryptedContent,
    pubkey: walletServicePubkey,
  };

  // Sign and publish event
  const signedEvent = finalizeEvent(event, walletSk);

  // Relay action
  const relay = await Relay.connect(relayUrl);
  await relay.publish(signedEvent);
  log.debug(`Published event response, id: ${signedEvent.id}`);
  return;
};

module.exports = {
  validateEventAndGetUser,
  broadcastEventResponse,
};

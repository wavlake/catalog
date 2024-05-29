// this function can be manually called to publish a NIP-47 info event (kind 13194)
// https://github.com/nostr-protocol/nips/blob/master/47.md#events

// This event is replaceable and should be replaced whenever the wallet service commands are modified
const { Relay, finalizeEvent } = require("nostr-tools");
import { hexToBytes } from "@noble/hashes/utils"; // already an installed dependency
require("dotenv").config();
require("websocket-polyfill");

const relayUrl = process.env.WAVLAKE_RELAY;
const walletSk = hexToBytes(process.env.WALLET_SERVICE_SK);

// modify this array to add/remove supported commands
const supportedWalletcommands = ["get_balance", "pay_invoice"];
const content = supportedWalletcommands.join(" ");

const publish13194 = async () => {
  let event = {
    kind: 13194,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content,
  };

  // Sign and publish event
  const signedEvent = await finalizeEvent(event, walletSk);
  const relay = await Relay.connect(relayUrl);
  await relay.publish(signedEvent);
  console.log("published event with content:", content);
  // console.log("event:", signedEvent);
  process.exit();
};

publish13194();

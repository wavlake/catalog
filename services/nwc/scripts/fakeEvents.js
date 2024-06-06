require("dotenv").config();
require("websocket-polyfill");
const { relayInit, getPublicKey, finishEvent, nip04 } = require("nostr-tools");
const log = require("loglevel");
log.setLevel(process.env.LOGLEVEL);
const relayUrl = process.env.RELAY;
const walletSk = process.env.WALLET_SERVICE_SECRET;
const walletServicePubkey = getPublicKey(walletSk);
const { webcrypto } = require("node:crypto");
globalThis.crypto = webcrypto;

// Script for publishing fake NWC events to relay for testing

// Fake user
const testSecret =
  "022f354b92cbbd1be441b480a8faabece4c3786dad28dc3ed436252c04205eb9";
const testPubkey = getPublicKey(testSecret);
log.debug(`testPubkey: ${testPubkey}`);

// Relay setup
const relay = relayInit(relayUrl);
relay.on("connect", () => {
  console.log(`connected to ${relay.url}`);
});
relay.on("error", () => {
  console.log(`failed to connect to ${relay.url}`);
});

async function main() {
  await relay.connect();

  let sub = relay.sub([
    {
      // kinds: [13194, 23194, 23195, 9734, 9735],
      kinds: [23194],
    },
  ]);

  sub.on("event", (event) => {
    console.log("got event:", event);
  });

  // PAY INVOICE

  const encryptedCommand = await nip04.encrypt(
    testSecret, // sender secret
    walletServicePubkey, // receiver pubkey
    JSON.stringify({
      method: "pay_invoice",
      params: {
        invoice:
          "lnbc20n1pn9wevasp5x9x62vzc9t4n8z907dq5jm6rpav6qlxz9lhjf0yag93rkt4rqv8qpp5hgf6j22te9w34ruj27ld06g95wmj78qppl8w49646gn7upm8hc0qdqqnp4qwh05slmksqfkgdyz2wst9fewjmah2amldg3jg2pqzqgvr723mslqxqrrsxcqzzn9qyysgq0864uxqvg27q3a6t7c6r0ws90q8yk67shfcncmylv0959a98vl74g9rdgw5xmra5ncdvajk966nhrmela9ezcuytpj2t52mwgdwp2rcpts32yv", // bolt11 invoice
      },
    })
  );

  // Event
  let event = {
    kind: 23194,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["p", walletServicePubkey]],
    content: encryptedCommand,
    pubkey: testPubkey,
  };

  // Sign and publish event
  const signedEvent = finishEvent(event, testSecret);
  await relay.publish(signedEvent);
}

main();

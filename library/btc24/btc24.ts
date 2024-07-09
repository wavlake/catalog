import {
  SimplePool,
  finalizeEvent,
  useWebSocketImplementation,
} from "nostr-tools";
import log from "loglevel";
import db from "../db";
const { encrypt } = require("nostr-tools/nip04");
import { hexToBytes } from "@noble/hashes/utils";
useWebSocketImplementation(require("ws"));

interface ZapRequestEvent {
  content: string;
  tags: [string, string][];
}

const WAVLAKE_SECRET = hexToBytes(process.env.NOSTR_SECRET);
const DM_RECEIVER_PUBKEY =
  "5195cb1e807a4f412f8bef2a08258244f168c4903d1ab17675eb1f3a059f5921";
const DM_RECEIVER_RELAYS = [
  "wss://relay.primal.net",
  "wss://relay.wavlake.com",
];

const getTrackMetadata = async (trackId: string) => {
  const trackDetails = await db
    .knex("track_info")
    .select("title", "artist", "artwork_url")
    .where("id", "=", trackId)
    .then((data) => {
      return data[0];
    })
    .catch((err) => {
      log.error(`Error getting track metadata for ${trackId}: ${err}`);
    });
  return trackDetails;
};

export const handleConferenceZap = async (zapRequestEvent: ZapRequestEvent) => {
  log.info("Handling conference zap request");
  try {
    // Parse zap request for track id and message
    const aTag = zapRequestEvent.tags.find((x) => x[0] === "a");
    const comment = zapRequestEvent.content;
    const amount = zapRequestEvent.tags.find((x) => x[0] === "amount")[1];

    const trackId = aTag[1].split(":")[2];

    // Retrive track metadata (artwork, title, artist)
    const trackDetails = await getTrackMetadata(trackId);

    const messageObject = {
      sats: parseInt(amount) / 1000,
      message: comment,
      trackName: trackDetails.title,
      trackArtist: trackDetails.artist,
      trackAlbumArt: trackDetails.artwork_url,
    };

    const encryptedMessage = await encrypt(
      WAVLAKE_SECRET,
      DM_RECEIVER_PUBKEY,
      JSON.stringify(messageObject)
    );
    let event = {
      kind: 4,
      created_at: Math.round(Date.now() / 1000),
      tags: [["p", DM_RECEIVER_PUBKEY, "wss://relay.primal.net"]],
      content: encryptedMessage,
    };

    // log.debug(`Signing zap receipt: ${JSON.stringify(zapReceipt)}`);

    const signedEvent = finalizeEvent(event, WAVLAKE_SECRET);

    // Publish to all relays
    const pool = new SimplePool();
    let relays = DM_RECEIVER_RELAYS;
    Promise.any(pool.publish(relays, signedEvent))
      .then(() => {
        log.debug(`Published btc24 message for ${trackId}`);
        return;
      })
      .catch((e) => {
        log.error(`Error publishing btc24 message receipt: ${e}`);
        return;
      });
    return;
  } catch (e) {
    log.error(`Error handling conference zap: ${e}`);
  }
};

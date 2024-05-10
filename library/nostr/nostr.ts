import { SimplePool } from "nostr-tools";
import fetch from "node-fetch";
import { DEFAULT_READ_RELAY_URIS } from "./common";

const pool = new SimplePool();

export const getProfileMetadata = async (
  pubkey: string,
  relayUris: string[] = DEFAULT_READ_RELAY_URIS
) => {
  const filter = {
    kinds: [0],
    authors: [pubkey],
  };
  const events = await pool.querySync(relayUris, filter);
  return events.sort((a, b) => b.created_at - a.created_at)[0];
};

// put request to npub-metadata with /:npub as a route param
const npubMetadataService = process.env.NPUB_UPDATE_SERVICE_URL;
export const updateNpubMetadata = async function (npub) {
  const res = await fetch(`${npubMetadataService}/${npub}`, {
    method: "PUT",
  });

  return res.json();
};

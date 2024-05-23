import fetch from "node-fetch";
import { Filter, SimplePool } from "nostr-tools";
import { Prisma } from "@prisma/client";
import { DEFAULT_READ_RELAY_URIS } from "./common";

const pool = new SimplePool();

const getProfileMetadata = async (
  pubkey: string,
  relayUris: string[] = DEFAULT_READ_RELAY_URIS
) => {
  const filter = {
    kinds: [0],
    authors: [pubkey],
  };
  const events = await pool.get(relayUris, filter);
  return events;
};

// put request to npub-metadata with /:npub as a route param
const npubMetadataService = process.env.NPUB_UPDATE_SERVICE_URL;
const updateNpubMetadata = async function (npub) {
  const res = await fetch(`${npubMetadataService}/${npub}`, {
    method: "PUT",
  });

  return res.json();
};

const getFollowersList = async (publicHex: string) => {
  const pool = new SimplePool();
  const filter: Filter = {
    kinds: [3],
    ["#p"]: [publicHex],
  };
  return pool.querySync(DEFAULT_READ_RELAY_URIS, filter);
};

interface Follow extends Prisma.JsonArray {
  pubkey: string;
  relay?: string;
  petname?: string;
}

const getFollowsList = async (publicHex: string): Promise<Follow[]> => {
  const pool = new SimplePool();
  const filter: Filter = {
    kinds: [3],
    authors: [publicHex],
    limit: 1,
  };

  const event = await pool.get(DEFAULT_READ_RELAY_URIS, filter);
  if (!event?.tags.length) {
    return [];
  }

  const followsList = event.tags.reduce(
    (acc, [tag, pubkey, relay, petname]) => {
      if (tag === "p") {
        return acc.concat([{ pubkey, relay, petname } as Follow]);
      }
      return acc;
    },
    [] as Follow[]
  );

  return followsList;
};

export {
  getProfileMetadata,
  getFollowersList,
  getFollowsList,
  updateNpubMetadata,
};

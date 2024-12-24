import fetch from "node-fetch";
import { Filter, SimplePool } from "nostr-tools";
import { DEFAULT_READ_RELAY_URIS } from "./common";
import { Follow } from "../common";
import log from "loglevel";
import axios from "axios";

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
const updateNpubMetadata = async function (
  npub: String,
  forceUpdate: boolean = false
) {
  const res = await fetch(
    forceUpdate
      ? `${npubMetadataService}/${npub}/true`
      : `${npubMetadataService}/${npub}`,
    {
      method: "PUT",
    }
  ).catch((err) => {
    log.error("Error fetching npub metadata: ", err);
    return { ok: false };
  });

  if (!res.ok) {
    log.info(
      "error response while updating npub metadata: ",
      res.status,
      res.statusText
    );
    return { success: false };
  }

  return res?.json();
};

const nostrBandApi = axios.create({
  baseURL: "https://api.nostr.band",
  timeout: 10000,
});

const getFollowersList = async (publicHex: string) => {
  const response = await nostrBandApi
    .get<{
      stats: {
        [pubkey: string]: {
          followers_pubkey_count: number;
        };
      };
    }>(`/v0/stats/profile/${publicHex}`)
    .catch((err) => {
      log.error("Error fetching followers list from nostr.band API: ", err);
      return { data: { stats: {} } };
    });

  const followersCount =
    response?.data?.stats?.[publicHex]?.followers_pubkey_count ?? 0;
  return followersCount as number;
};

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

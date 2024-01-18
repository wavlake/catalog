import { Filter, relayInit, Event } from "nostr-tools";

const DEFAULT_READ_RELAY_URIS = [
  "wss://purplepag.es",
  "wss://relay.nostr.band",
  "wss://relay.damus.io",
  "wss://nostr.wine",
  "wss://relay.snort.social",
  "wss://relay.wavlake.com",
];

const DEFAULT_WRITE_RELAY_URIS = [
  "wss://purplepag.es",
  "wss://relay.nostr.band",
  "wss://relay.damus.io",
  "wss://relay.wavlake.com",
  "wss://nostr.mutinywallet.com",
];

export const getProfileMetadata = async (
  pubkey: string,
  relayUris: string[] = DEFAULT_READ_RELAY_URIS
) => {
  const filter = {
    kinds: [0],
    authors: [pubkey],
  };
  return getEventFromPool(filter, relayUris);
};

const getEventFromPool = async (
  filter: Filter,
  relayUris: string[] = DEFAULT_READ_RELAY_URIS
) => {
  const promises = relayUris.map((relayUri) =>
    getEventFromRelay(relayUri, filter)
  );
  const events = (await Promise.allSettled(promises))
    .map((result) => {
      if (result.status === "fulfilled") {
        return result.value;
      }
    })
    .filter((result) => {
      return result !== undefined && result !== null;
    }) as Event[];

  if (events.length === 0) {
    return null;
  }

  return getMostRecentEvent(events);
};

const getMostRecentEvent = (events: Event[]) => {
  return events.sort((a, b) => b.created_at - a.created_at)[0];
};

const getEventFromRelay = (
  relayUri: string,
  filter: Filter
): Promise<Event | null> => {
  return new Promise((resolve, reject) => {
    const relay = relayInit(relayUri);

    relay.on("connect", async () => {
      const event = await relay.get(filter);

      relay.close();
      resolve(event);
    });
    relay.on("error", () => {
      relay.close();
      reject(new Error(`failed to connect to ${relay.url}`));
    });

    relay.connect().catch((e) => {
      console.log(`error connecting to relay ${relay.url}`);
      relay.close();
      reject(e);
    });
  });
};

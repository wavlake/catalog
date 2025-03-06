#!/usr/bin/env node

const fs = require("fs");
const process = require("process");
const { SimplePool } = require("nostr-tools/pool");
const { useWebSocketImplementation } = require("nostr-tools/pool");

// Use Node.js WebSocket implementation
const WebSocket = require("ws");
useWebSocketImplementation(WebSocket);

// Configuration
const RELAY_URL = "wss://relay.wavlake.com"; // Replace with your relay URL
const OUTPUT_DIR = "./"; // Directory to save output files
const FILE_PREFIX = "nostr-events-kind-"; // Prefix for output files
const FILE_EXTENSION = ".jsonl"; // File extension
const BATCH_SIZE = 5000; // Maximum events per request (relay limit)
const LOGGING_BATCH = 1000; // How often to log progress
const TIMEOUT_MINUTES = 30;
const PAUSE_BETWEEN_KINDS = 10000; // 10 seconds in milliseconds
const PAUSE_BETWEEN_BATCHES = 1000; // 1 second in milliseconds

// Event kinds to fetch (in order)
const EVENT_KINDS = [
  // { kind: 0, description: "metadata events (kind 0)" },
  // { kind: 9735, description: "zap events (kind 9735)" },
  { kind: 1, description: "comment events (kind 1)" },
];

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Track events
let totalEventCount = 0;
let processedIds = new Set(); // To prevent duplicate events
let writeStreams = {}; // Store write streams for each kind

// Set up the pool with just your relay
const pool = new SimplePool();

console.log(`Connecting to ${RELAY_URL}...`);

// Function to create write stream for a kind
function createWriteStream(kind) {
  const filename = `${OUTPUT_DIR}${FILE_PREFIX}${kind}${FILE_EXTENSION}`;
  console.log(`Creating output file: ${filename}`);
  return fs.createWriteStream(filename);
}

// Write event to the appropriate file
function writeEvent(event, kind) {
  try {
    // Write each event as a separate line in JSON format (jsonl)
    writeStreams[kind].write(JSON.stringify(event) + "\n");
    totalEventCount++;

    if (totalEventCount % LOGGING_BATCH === 0) {
      console.log(`Processed ${totalEventCount} total events so far...`);
    }
  } catch (error) {
    console.error(`Error writing event to kind ${kind} file:`, error);
  }
}

// Function to fetch a batch of events with pagination
async function fetchEventsBatch(kind, description, until) {
  return new Promise((resolve, reject) => {
    console.log(
      `Fetching batch of ${description} before timestamp ${until}...`
    );

    // Create write stream for this kind if not exists
    if (!writeStreams[kind]) {
      writeStreams[kind] = createWriteStream(kind);
    }

    let batchEvents = [];
    let timeoutId;

    // Create filter with until timestamp
    const filter = {
      kinds: [kind],
      limit: BATCH_SIZE,
    };

    // Only add until if it's defined (not for first batch)
    if (until) {
      filter.until = until;
    }

    // Create a subscription for this batch
    const sub = pool.subscribeMany([RELAY_URL], [filter], {
      onevent(event) {
        // Skip if we've already seen this event
        if (processedIds.has(event.id)) return;

        // Process event
        writeEvent(event, kind);
        processedIds.add(event.id);
        batchEvents.push(event);
      },
      oneose() {
        console.log(
          `EOSE received for batch. Fetched ${batchEvents.length} events.`
        );
        clearTimeout(timeoutId);
        sub.close();
        resolve(batchEvents);
      },
    });

    // Set a timeout for this batch
    timeoutId = setTimeout(() => {
      console.log(`Timeout waiting for batch. Moving on.`);
      sub.close();
      resolve(batchEvents);
    }, 30 * 1000); // 30 second timeout per batch
  });
}

// Function to fetch all events of a specific kind using pagination
async function fetchAllEventsByKind(kind, description) {
  let kindEventCount = 0;
  let until = Math.floor(Date.now() / 1000); // Start with current timestamp
  let oldestTimestamp = until;
  let batchEvents;

  console.log(`Starting pagination fetch for all ${description}...`);

  do {
    // Fetch a batch of events
    batchEvents = await fetchEventsBatch(kind, description, until);
    kindEventCount += batchEvents.length;

    // Find the oldest event timestamp in this batch
    if (batchEvents.length > 0) {
      // Sort events by created_at timestamp
      batchEvents.sort((a, b) => a.created_at - b.created_at);
      oldestTimestamp = batchEvents[0].created_at;

      // Update until timestamp to fetch earlier events in next batch
      // Subtract 1 second to avoid duplicates at boundary
      until = oldestTimestamp - 1;

      console.log(
        `Oldest event in batch: ${new Date(
          oldestTimestamp * 1000
        ).toISOString()}`
      );
      console.log(
        `Next batch will fetch events before: ${new Date(
          until * 1000
        ).toISOString()}`
      );

      // Short pause between batches to not overwhelm the relay
      await new Promise((resolve) =>
        setTimeout(resolve, PAUSE_BETWEEN_BATCHES)
      );
    }
  } while (batchEvents.length > 0); // Continue until we get an empty batch

  console.log(`Completed fetching ${kindEventCount} ${description}`);
  return kindEventCount;
}

// Main function
async function main() {
  try {
    // Process each kind in sequence
    for (let i = 0; i < EVENT_KINDS.length; i++) {
      const { kind, description } = EVENT_KINDS[i];

      // Fetch events for this kind with pagination
      const kindCount = await fetchAllEventsByKind(kind, description);
      console.log(`Completed fetching ${kindCount} ${description}`);

      // Pause between kinds (except after the last one)
      if (i < EVENT_KINDS.length - 1) {
        console.log(
          `Pausing for ${
            PAUSE_BETWEEN_KINDS / 1000
          } seconds before fetching next kind...`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, PAUSE_BETWEEN_KINDS)
        );
      }
    }

    console.log("All specified event kinds have been fetched.");
    cleanup();
  } catch (error) {
    console.error("Error during export:", error);
    cleanup();
  }
}

// Clean up resources
function cleanup() {
  console.log("Cleaning up...");

  // Close all write streams
  for (const kind in writeStreams) {
    writeStreams[kind].end();
    console.log(`Closed file for kind ${kind}`);
  }

  // List all files with their event counts
  console.log("\nExport summary:");
  console.log(`Total events: ${totalEventCount}`);

  for (const { kind, description } of EVENT_KINDS) {
    const filename = `${FILE_PREFIX}${kind}${FILE_EXTENSION}`;
    try {
      const stats = fs.statSync(`${OUTPUT_DIR}${filename}`);
      const fileSize = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`- ${filename}: ${fileSize} MB`);
    } catch (error) {
      console.log(`- ${filename}: Error reading file stats`);
    }
  }

  console.log("\nTo import into strfry, run one of these commands:");
  EVENT_KINDS.forEach(({ kind }) => {
    console.log(`cat ${FILE_PREFIX}${kind}${FILE_EXTENSION} | strfry import`);
  });

  // Close all pool connections
  pool.close([RELAY_URL]);

  // Exit the process
  process.exit(0);
}

// Handle process termination
process.on("SIGINT", () => {
  console.log("\nExport interrupted.");
  cleanup();
});

// Set an overall timeout
setTimeout(() => {
  console.log(`Overall timeout after ${TIMEOUT_MINUTES} minutes.`);
  cleanup();
}, TIMEOUT_MINUTES * 60 * 1000);

// Start the export
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});

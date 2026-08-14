import {
  processNextOutboxEvent,
  recoverStuckOutboxEvents,
} from "./outbox";
import { ingestAllBusinessRuns } from "./dograh/ingest";
import { recoverStuckBusinessSyncs } from "./dograh/tenant";

const idleDelayMs = 1_000;
const ingestIntervalMs = 60_000;

let shuttingDown = false;

function requestShutdown(signal: string): void {
  console.log(`Received ${signal}, finishing current event before exit.`);
  shuttingDown = true;
}

process.on("SIGTERM", () => requestShutdown("SIGTERM"));
process.on("SIGINT", () => requestShutdown("SIGINT"));

await recoverStuckOutboxEvents();
await recoverStuckBusinessSyncs();

let nextIngestAt = 0;

while (!shuttingDown) {
  if (Date.now() >= nextIngestAt) {
    nextIngestAt = Date.now() + ingestIntervalMs;
    try {
      await ingestAllBusinessRuns();
    } catch (caught) {
      console.error("Run ingestion pass failed:", caught);
    }
  }
  const processed = await processNextOutboxEvent();
  if (!processed && !shuttingDown) await Bun.sleep(idleDelayMs);
}

process.exit(0);

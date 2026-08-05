import {
  processNextOutboxEvent,
  recoverStuckOutboxEvents,
} from "./outbox";
import { ingestAllBusinessRuns } from "./dograh/ingest";
import { recoverStuckBusinessSyncs } from "./dograh/tenant";

const idleDelayMs = 1_000;
const ingestIntervalMs = 60_000;

await recoverStuckOutboxEvents();
await recoverStuckBusinessSyncs();

let nextIngestAt = 0;

while (true) {
  if (Date.now() >= nextIngestAt) {
    nextIngestAt = Date.now() + ingestIntervalMs;
    try {
      await ingestAllBusinessRuns();
    } catch (caught) {
      console.error("Run ingestion pass failed:", caught);
    }
  }
  const processed = await processNextOutboxEvent();
  if (!processed) await Bun.sleep(idleDelayMs);
}

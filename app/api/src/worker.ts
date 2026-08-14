import {
  processNextOutboxEvent,
  recoverStuckOutboxEvents,
} from "./outbox";
import { ingestAllBusinessRuns } from "./dograh/ingest";
import { recoverStuckBusinessSyncs } from "./dograh/tenant";

const idleDelayMs = 1_000;
const ingestIntervalMs = 60_000;
const heartbeatIntervalMs = 10_000;
const heartbeatPath =
  process.env.WORKER_HEARTBEAT_PATH ?? "/tmp/vocalonix-worker-heartbeat";

let nextHeartbeatAt = 0;

async function writeHeartbeat(): Promise<void> {
  if (Date.now() < nextHeartbeatAt) return;
  nextHeartbeatAt = Date.now() + heartbeatIntervalMs;
  try {
    await Bun.write(heartbeatPath, String(Date.now()));
  } catch (caught) {
    console.error("Failed to write worker heartbeat:", caught);
  }
}

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
  await writeHeartbeat();
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

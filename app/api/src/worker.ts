import {
  processNextOutboxEvent,
  recoverStuckOutboxEvents,
} from "./outbox";
import { linkOrphanedBusinesses, reconcileAllUsage } from "./billing/usage";
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
// Businesses created before billing moved to the account have no account link.
// Without one they are billed by nothing and enforced by nothing, so this runs
// once at boot rather than waiting for somebody to open the billing panel.
try {
  const linked = await linkOrphanedBusinesses();
  if (linked > 0) console.log(`Linked ${linked} businesses to a billing account.`);
} catch (caught) {
  console.error("Linking businesses to billing accounts failed:", caught);
}

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
    // Runs immediately after ingestion, because ingestion is what moves the
    // minute count — checking before it would always act on stale usage.
    try {
      await reconcileAllUsage();
    } catch (caught) {
      console.error("Usage reconciliation pass failed:", caught);
    }
  }
  const processed = await processNextOutboxEvent();
  if (!processed && !shuttingDown) await Bun.sleep(idleDelayMs);
}

process.exit(0);

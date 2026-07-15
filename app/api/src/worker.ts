import {
  processNextOutboxEvent,
  recoverStuckOutboxEvents,
} from "./outbox";
import { recoverStuckBusinessSyncs } from "./dograh/tenant";

const idleDelayMs = 1_000;

await recoverStuckOutboxEvents();
await recoverStuckBusinessSyncs();

while (true) {
  const processed = await processNextOutboxEvent();
  if (!processed) await Bun.sleep(idleDelayMs);
}

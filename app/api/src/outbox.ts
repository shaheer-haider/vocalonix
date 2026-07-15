import { randomUUID } from "node:crypto";

import { and, asc, eq, lt, lte, sql } from "drizzle-orm";

import { db } from "./db/client";
import { businessOnboarding, outboxEvents } from "./db/schema";
import {
  deleteRemoteKnowledge,
  DograhSyncError,
  offboardBusiness,
  publishBusinessWidget,
  reconcileKnowledge,
  synchronizeBusiness,
  uploadKnowledgeSource,
} from "./dograh/tenant";

export interface OutboxEventInput {
  businessId: string;
  eventType: string;
  payload: Record<string, unknown>;
  dedupeKey?: string;
  availableAt?: Date;
}

export async function enqueueOutbox(input: OutboxEventInput): Promise<void> {
  await db
    .insert(outboxEvents)
    .values({
      id: randomUUID(),
      businessId: input.businessId,
      eventType: input.eventType,
      payload: input.payload,
      dedupeKey: input.dedupeKey,
      availableAt: input.availableAt ?? new Date(),
    })
    .onConflictDoNothing();
}

function payloadString(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];
  return typeof value === "string" && value ? value : null;
}

interface HandlerResult {
  retryAfterMs?: number;
}

async function handleEvent(
  event: typeof outboxEvents.$inferSelect,
): Promise<HandlerResult> {
  const businessId = event.businessId ?? payloadString(event.payload, "businessId");
  if (!businessId) throw new Error("Outbox event is missing a business ID.");

  if (
    event.eventType === "dograh.workflow.ensure" ||
    event.eventType === "dograh.workflow.sync"
  ) {
    await synchronizeBusiness(businessId);
    const cleanupKnowledgeId = payloadString(
      event.payload,
      "cleanupKnowledgeId",
    );
    if (cleanupKnowledgeId) {
      await enqueueOutbox({
        businessId,
        eventType: "dograh.knowledge.delete",
        payload: { businessId, knowledgeId: cleanupKnowledgeId },
        dedupeKey: `dograh.knowledge.delete:${cleanupKnowledgeId}`,
      });
    }
    return {};
  }

  if (event.eventType === "dograh.widget.publish") {
    await publishBusinessWidget(businessId);
    const [onboarding] = await db
      .select({ completedSteps: businessOnboarding.completedSteps })
      .from(businessOnboarding)
      .where(eq(businessOnboarding.businessId, businessId))
      .limit(1);
    const completedSteps = [
      ...new Set([...(onboarding?.completedSteps ?? []), "review"]),
    ];
    await db
      .insert(businessOnboarding)
      .values({
        businessId,
        completedSteps,
        currentStep: "review",
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: businessOnboarding.businessId,
        set: {
          completedSteps,
          currentStep: "review",
          publishedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    return {};
  }

  if (event.eventType === "dograh.knowledge.upload") {
    const knowledgeId = payloadString(event.payload, "knowledgeId");
    if (!knowledgeId) throw new Error("Knowledge upload event is missing an ID.");
    await uploadKnowledgeSource(knowledgeId);
    await enqueueOutbox({
      businessId,
      eventType: "dograh.knowledge.reconcile",
      payload: { businessId, knowledgeId },
      dedupeKey: `dograh.knowledge.reconcile:${knowledgeId}`,
      availableAt: new Date(Date.now() + 5_000),
    });
    return {};
  }

  if (event.eventType === "dograh.knowledge.reconcile") {
    const knowledgeId = payloadString(event.payload, "knowledgeId");
    if (!knowledgeId) {
      throw new Error("Knowledge reconciliation event is missing an ID.");
    }
    const result = await reconcileKnowledge(knowledgeId);
    return result === "pending" ? { retryAfterMs: 5_000 } : {};
  }

  if (event.eventType === "dograh.knowledge.delete") {
    const knowledgeId = payloadString(event.payload, "knowledgeId");
    if (!knowledgeId) throw new Error("Knowledge deletion event is missing an ID.");
    await deleteRemoteKnowledge(knowledgeId);
    return {};
  }

  if (event.eventType === "dograh.business.offboard") {
    await offboardBusiness(businessId);
    return {};
  }

  throw new Error(`Unsupported outbox event type: ${event.eventType}`);
}

async function claimNextEvent() {
  const [candidate] = await db
    .select({ id: outboxEvents.id })
    .from(outboxEvents)
    .where(
      and(
        eq(outboxEvents.status, "pending"),
        lte(outboxEvents.availableAt, new Date()),
      ),
    )
    .orderBy(asc(outboxEvents.availableAt), asc(outboxEvents.createdAt))
    .limit(1);
  if (!candidate) return null;

  const [claimed] = await db
    .update(outboxEvents)
    .set({
      status: "processing",
      lockedAt: new Date(),
      attemptCount: sql`${outboxEvents.attemptCount} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(outboxEvents.id, candidate.id),
        eq(outboxEvents.status, "pending"),
      ),
    )
    .returning();
  return claimed ?? null;
}

function retryDelayMs(attemptCount: number): number {
  return Math.min(5 * 60_000, 2 ** Math.max(0, attemptCount - 1) * 5_000);
}

export interface OutboxRescheduleUpdate {
  status: "pending";
  lockedAt: null;
  attemptCount: number;
  lastError: null;
  availableAt: Date;
  updatedAt: Date;
}

export interface OutboxFailureUpdate {
  status: "pending" | "failed";
  lockedAt: null;
  lastError: string;
  availableAt: Date;
  updatedAt: Date;
}

// A successful processing poll (e.g. remote document still processing) is not a
// failure: reset the attempt budget so slow-but-healthy work never exhausts the
// retry allowance reserved for genuine failures.
export function pollRescheduleUpdate(
  retryAfterMs: number,
  now: Date = new Date(),
): OutboxRescheduleUpdate {
  return {
    status: "pending",
    lockedAt: null,
    attemptCount: 0,
    lastError: null,
    availableAt: new Date(now.getTime() + retryAfterMs),
    updatedAt: now,
  };
}

export function failureUpdate(
  event: Pick<
    typeof outboxEvents.$inferSelect,
    "attemptCount" | "maxAttempts"
  >,
  retryable: boolean,
  message: string,
  now: Date = new Date(),
): OutboxFailureUpdate {
  const exhausted = event.attemptCount >= event.maxAttempts;
  return {
    status: retryable && !exhausted ? "pending" : "failed",
    lockedAt: null,
    lastError: message,
    availableAt: new Date(now.getTime() + retryDelayMs(event.attemptCount)),
    updatedAt: now,
  };
}

export async function recoverStuckOutboxEvents(): Promise<number> {
  const recovered = await db
    .update(outboxEvents)
    .set({
      status: "pending",
      lockedAt: null,
      availableAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(outboxEvents.status, "processing"),
        lt(outboxEvents.lockedAt, new Date(Date.now() - 5 * 60_000)),
      ),
    )
    .returning({ id: outboxEvents.id });
  return recovered.length;
}

export async function processNextOutboxEvent(): Promise<boolean> {
  const event = await claimNextEvent();
  if (!event) return false;

  try {
    const result = await handleEvent(event);
    if (result.retryAfterMs) {
      await db
        .update(outboxEvents)
        .set(pollRescheduleUpdate(result.retryAfterMs))
        .where(eq(outboxEvents.id, event.id));
      return true;
    }
    await db
      .update(outboxEvents)
      .set({
        status: "completed",
        lockedAt: null,
        lastError: null,
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(outboxEvents.id, event.id));
  } catch (error) {
    const retryable =
      error instanceof DograhSyncError ? error.failure.retryable : true;
    const message =
      error instanceof DograhSyncError
        ? error.message
        : "Outbox processing failed unexpectedly.";
    await db
      .update(outboxEvents)
      .set(failureUpdate(event, retryable, message))
      .where(eq(outboxEvents.id, event.id));
  }
  return true;
}

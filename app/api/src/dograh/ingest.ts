import { randomUUID } from "node:crypto";

import { and, eq, isNull, or } from "drizzle-orm";

import { db } from "../db/client";
import {
  businessDograhMappings,
  callbackTasks,
  contacts,
} from "../db/schema";
import { dograh } from "./client";
import { extractVariablesFromTranscript } from "./extract";
import type { DograhWorkflowRun } from "./types";

const RUNS_PAGE_LIMIT = 50;
const DEFAULT_CALLBACK_DELAY_MS = 2 * 60 * 60 * 1000;

function extractedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (["unknown", "n/a", "none", "null"].includes(trimmed.toLowerCase())) {
    return null;
  }
  return trimmed;
}

export interface ExtractedCaller {
  name: string | null;
  phone: string | null;
  email: string | null;
  callbackRequested: boolean;
  callbackReason: string | null;
}

export function callerFromContext(
  context: Record<string, unknown>,
): ExtractedCaller {
  return {
    name: extractedString(context.caller_name),
    phone: extractedString(context.caller_phone),
    email: extractedString(context.caller_email),
    callbackRequested: context.callback_requested === true,
    callbackReason: extractedString(context.callback_reason),
  };
}

export function extractCaller(run: DograhWorkflowRun): ExtractedCaller {
  return callerFromContext(run.gathered_context ?? {});
}

export function hasCallerSignal(caller: ExtractedCaller): boolean {
  return Boolean(
    caller.name || caller.phone || caller.email || caller.callbackRequested,
  );
}

async function extractCallerWithFallback(
  run: DograhWorkflowRun,
): Promise<ExtractedCaller> {
  const caller = extractCaller(run);
  if (hasCallerSignal(caller)) return caller;
  if (!run.transcript_public_url) return caller;
  const transcript = await dograh.fetchRunTranscript(run.transcript_public_url);
  if (!transcript) return caller;
  const variables = await extractVariablesFromTranscript(transcript);
  if (!variables) return caller;
  return callerFromContext(variables);
}

async function upsertCallContact(
  businessId: string,
  caller: ExtractedCaller,
): Promise<void> {
  if (!caller.name && !caller.phone && !caller.email) return;
  const matchers = [
    caller.phone ? eq(contacts.phone, caller.phone) : null,
    caller.email ? eq(contacts.email, caller.email) : null,
  ].filter((matcher) => matcher !== null);
  const [existing] = matchers.length
    ? await db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.businessId, businessId),
            isNull(contacts.deletedAt),
            or(...matchers),
          ),
        )
        .limit(1)
    : [];
  if (existing) {
    const updates: Partial<typeof contacts.$inferInsert> = {};
    if (!existing.name && caller.name) updates.name = caller.name;
    if (!existing.phone && caller.phone) updates.phone = caller.phone;
    if (!existing.email && caller.email) updates.email = caller.email;
    if (Object.keys(updates).length === 0) return;
    updates.updatedAt = new Date();
    await db.update(contacts).set(updates).where(eq(contacts.id, existing.id));
    return;
  }
  await db.insert(contacts).values({
    id: randomUUID(),
    businessId,
    name: caller.name,
    phone: caller.phone,
    email: caller.email,
    source: "call",
  });
}

async function createCallCallback(
  businessId: string,
  run: DograhWorkflowRun,
  caller: ExtractedCaller,
): Promise<void> {
  if (!caller.callbackRequested) return;
  const [existing] = await db
    .select({ id: callbackTasks.id })
    .from(callbackTasks)
    .where(
      and(
        eq(callbackTasks.businessId, businessId),
        eq(callbackTasks.runId, run.id),
      ),
    )
    .limit(1);
  if (existing) return;
  await db.insert(callbackTasks).values({
    id: randomUUID(),
    businessId,
    contactName: caller.name ?? caller.phone ?? caller.email ?? "Caller",
    contactChannel:
      caller.phone ?? caller.email ?? "Browser call (no number left)",
    reason: caller.callbackReason ?? "Caller asked for a callback.",
    source: "call",
    runId: run.id,
    promisedAt: new Date(Date.now() + DEFAULT_CALLBACK_DELAY_MS),
  });
}

export async function ingestBusinessRuns(
  businessId: string,
  workflowId: number,
  lastIngestedRunId: number,
): Promise<number> {
  const page = await dograh.listWorkflowRuns(workflowId, 1, RUNS_PAGE_LIMIT);
  const fresh = page.runs
    .filter((run) => run.is_completed && run.id > lastIngestedRunId)
    .sort((left, right) => left.id - right.id);
  let highest = lastIngestedRunId;
  for (const run of fresh) {
    const caller = await extractCallerWithFallback(run);
    await upsertCallContact(businessId, caller);
    await createCallCallback(businessId, run, caller);
    highest = run.id;
  }
  if (highest > lastIngestedRunId) {
    await db
      .update(businessDograhMappings)
      .set({ lastIngestedRunId: highest, updatedAt: new Date() })
      .where(eq(businessDograhMappings.businessId, businessId));
  }
  return fresh.length;
}

export async function ingestAllBusinessRuns(): Promise<number> {
  const mappings = await db
    .select({
      businessId: businessDograhMappings.businessId,
      workflowId: businessDograhMappings.workflowId,
      lastIngestedRunId: businessDograhMappings.lastIngestedRunId,
    })
    .from(businessDograhMappings)
    .where(isNull(businessDograhMappings.offboardedAt));
  let ingested = 0;
  for (const mapping of mappings) {
    const workflowId = Number(mapping.workflowId);
    if (!mapping.workflowId || Number.isNaN(workflowId)) continue;
    try {
      ingested += await ingestBusinessRuns(
        mapping.businessId,
        workflowId,
        mapping.lastIngestedRunId,
      );
    } catch (caught) {
      console.error(
        `Run ingestion failed for business ${mapping.businessId}:`,
        caught,
      );
    }
  }
  return ingested;
}

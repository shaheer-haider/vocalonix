import { randomUUID } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "../db/client";
import {
  businessDograhMappings,
  callbackTasks,
  callRecords,
  knowledgeGaps,
} from "../db/schema";
import { linkContact } from "../tenant/contactLink";
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

const MAX_NAME_LENGTH = 80;
const MAX_REASON_LENGTH = 300;
const PHONE_PATTERN = /^\+?[0-9][0-9 ().\/-]{5,18}[0-9]$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function sanitizedName(value: unknown): string | null {
  const name = extractedString(value);
  if (!name) return null;
  if (name.length > MAX_NAME_LENGTH) return null;
  if (/[{}\[\]"\n]/.test(name)) return null;
  return name;
}

export function sanitizedPhone(value: unknown): string | null {
  const phone = extractedString(value);
  if (!phone) return null;
  return PHONE_PATTERN.test(phone) ? phone : null;
}

export function sanitizedEmail(value: unknown): string | null {
  const email = extractedString(value);
  if (!email) return null;
  return EMAIL_PATTERN.test(email) ? email : null;
}

function sanitizedReason(value: unknown): string | null {
  const reason = extractedString(value);
  if (!reason) return null;
  if (reason.length > MAX_REASON_LENGTH) return null;
  if (/[{}\n]/.test(reason)) return null;
  return reason;
}

const MIN_QUESTION_LENGTH = 8;
const MAX_QUESTION_LENGTH = 200;
const MAX_GAPS_PER_RUN = 10;

function sanitizedQuestion(value: unknown): string | null {
  const question = extractedString(value);
  if (!question) return null;
  if (
    question.length < MIN_QUESTION_LENGTH ||
    question.length > MAX_QUESTION_LENGTH
  ) {
    return null;
  }
  if (/[{}\n]/.test(question)) return null;
  return question;
}

export function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .replace(/[?!.\s]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ExtractedGap {
  question: string;
  agentResponse: string | null;
}

export function gapsFromContext(
  context: Record<string, unknown>,
): ExtractedGap[] {
  const raw = context.knowledge_gaps;
  if (!Array.isArray(raw)) return [];
  const gaps: ExtractedGap[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const question = sanitizedQuestion(record.question);
    if (!question) continue;
    gaps.push({
      question,
      agentResponse: sanitizedReason(record.agent_response),
    });
    if (gaps.length >= MAX_GAPS_PER_RUN) break;
  }
  return gaps;
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
    name: sanitizedName(context.caller_name),
    phone: sanitizedPhone(context.caller_phone),
    email: sanitizedEmail(context.caller_email),
    callbackRequested: context.callback_requested === true,
    callbackReason: sanitizedReason(context.callback_reason),
  };
}

export function extractCaller(run: DograhWorkflowRun): ExtractedCaller {
  return callerFromContext(run.gathered_context ?? {});
}

/**
 * Falls back to the caller ID for a caller who never gave a number.
 *
 * Applied last, and only to fill a gap. What someone tells the agent wins over
 * what the network says, because a caller may ask to be reached on a different
 * number and that is the one worth storing. But the caller ID is the only
 * identity a caller who says nothing at all ever has — without it an inbound
 * call produces no contact whatsoever, which is why phone calls were leaving
 * no trace in the contact list.
 *
 * Deliberately not folded into `extractCaller`: that would make every phone
 * call look like it had caller detail already, and suppress the transcript
 * extraction that recovers the name and email.
 */
export function withCallerId(
  caller: ExtractedCaller,
  run: DograhWorkflowRun,
): ExtractedCaller {
  if (caller.phone) return caller;
  const callerId = sanitizedPhone(run.initial_context?.caller_number);
  return callerId ? { ...caller, phone: callerId } : caller;
}

export function hasCallerSignal(caller: ExtractedCaller): boolean {
  return Boolean(
    caller.name || caller.phone || caller.email || caller.callbackRequested,
  );
}

interface RunInsights {
  caller: ExtractedCaller;
  gaps: ExtractedGap[];
}

async function extractRunInsights(
  run: DograhWorkflowRun,
): Promise<RunInsights> {
  const contextCaller = extractCaller(run);
  let transcriptUrl = run.transcript_public_url ?? null;
  if (!transcriptUrl) {
    const detail = await dograh.getWorkflowRun(run.workflow_id, run.id);
    transcriptUrl = detail.transcript_public_url ?? null;
  }
  const transcript = transcriptUrl
    ? await dograh.fetchRunTranscript(transcriptUrl)
    : null;
  const variables = transcript
    ? await extractVariablesFromTranscript(transcript)
    : null;
  const stated =
    hasCallerSignal(contextCaller) || !variables
      ? contextCaller
      : callerFromContext(variables);

  return {
    caller: withCallerId(stated, run),
    gaps: variables ? gapsFromContext(variables) : [],
  };
}

async function upsertCallContact(
  businessId: string,
  caller: ExtractedCaller,
): Promise<string | null> {
  return linkContact(businessId, caller, "call");
}

/**
 * Copies what a call *was* into our own store, so the list, the dashboard and
 * any metered plan can count and filter without paging the engine.
 *
 * Upserted rather than inserted: ingest is re-runnable and a backfill may
 * overlap it, and a call counted twice overstates a dashboard and overcharges
 * an invoice. The disposition and duration are refreshed on conflict because a
 * run's accounting can settle after it first appears as complete.
 */
export async function recordCall(
  businessId: string,
  run: DograhWorkflowRun,
  caller: ExtractedCaller,
  contactId: string | null,
): Promise<void> {
  const startedAt = new Date(run.created_at);
  if (Number.isNaN(startedAt.getTime())) return;

  const values = {
    id: randomUUID(),
    businessId,
    runId: run.id,
    workflowId: run.workflow_id,
    startedAt,
    durationSeconds: runDurationSeconds(run),
    completed: run.is_completed,
    mode: run.mode ?? null,
    disposition:
      run.gathered_context?.mapped_call_disposition ??
      run.gathered_context?.call_disposition ??
      null,
    nodesVisited: (run.gathered_context?.nodes_visited ?? []).filter(
      (node): node is string => typeof node === "string",
    ),
    hasTranscript: Boolean(run.transcript_url),
    hasRecording: Boolean(run.recording_url),
    callerNumber: sanitizedPhone(run.initial_context?.caller_number) ?? caller.phone,
    contactId,
  };

  await db
    .insert(callRecords)
    .values(values)
    .onConflictDoUpdate({
      target: [callRecords.businessId, callRecords.runId],
      set: {
        durationSeconds: values.durationSeconds,
        completed: values.completed,
        disposition: values.disposition,
        nodesVisited: values.nodesVisited,
        hasTranscript: values.hasTranscript,
        hasRecording: values.hasRecording,
        contactId: values.contactId,
        updatedAt: new Date(),
      },
    });
}

async function createCallCallback(
  businessId: string,
  run: DograhWorkflowRun,
  caller: ExtractedCaller,
  contactId: string | null,
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
    contactId,
    reason: caller.callbackReason ?? "Caller asked for a callback.",
    source: "call",
    runId: run.id,
    promisedAt: new Date(Date.now() + DEFAULT_CALLBACK_DELAY_MS),
  });
}

async function recordKnowledgeGaps(
  businessId: string,
  run: DograhWorkflowRun,
  gaps: ExtractedGap[],
): Promise<void> {
  const now = new Date();
  for (const gap of gaps) {
    const normalized = normalizeQuestion(gap.question);
    if (!normalized) continue;
    const [existing] = await db
      .select({
        id: knowledgeGaps.id,
        askCount: knowledgeGaps.askCount,
        agentResponse: knowledgeGaps.agentResponse,
      })
      .from(knowledgeGaps)
      .where(
        and(
          eq(knowledgeGaps.businessId, businessId),
          eq(knowledgeGaps.normalizedQuestion, normalized),
        ),
      )
      .limit(1);
    if (existing) {
      await db
        .update(knowledgeGaps)
        .set({
          askCount: existing.askCount + 1,
          agentResponse: gap.agentResponse ?? existing.agentResponse,
          runId: run.id,
          lastAskedAt: now,
          updatedAt: now,
        })
        .where(eq(knowledgeGaps.id, existing.id));
      continue;
    }
    await db.insert(knowledgeGaps).values({
      id: randomUUID(),
      businessId,
      normalizedQuestion: normalized,
      question: gap.question,
      agentResponse: gap.agentResponse ?? "",
      runId: run.id,
      lastAskedAt: now,
    });
  }
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
    const { caller, gaps } = await extractRunInsights(run);
    const contactId = await upsertCallContact(businessId, caller);
    await recordCall(businessId, run, caller, contactId);
    await createCallCallback(businessId, run, caller, contactId);
    await recordKnowledgeGaps(businessId, run, gaps);
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

const BACKFILL_MAX_PAGES = 20;

/**
 * Copies calls the engine already knows about into `call_records`.
 *
 * Normal ingest only looks at runs newer than `lastIngestedRunId`, so every
 * call taken before this table existed would otherwise be invisible to the
 * list and the dashboard — the history would appear to start the day it
 * shipped. Writes are upserts, so this is safe to run alongside ingest and
 * safe to run repeatedly.
 *
 * Deliberately does not fetch transcripts: the caller is read from context the
 * engine already returned. Backfilling would otherwise mean an LLM extraction
 * per historical call, and contacts and callbacks were already derived from
 * those runs when they were first ingested.
 */
export async function backfillCallRecords(): Promise<number> {
  const mappings = await db
    .select({
      businessId: businessDograhMappings.businessId,
      workflowId: businessDograhMappings.workflowId,
    })
    .from(businessDograhMappings);

  let written = 0;
  for (const mapping of mappings) {
    const workflowId = Number(mapping.workflowId);
    if (!Number.isFinite(workflowId)) continue;

    for (let page = 1; page <= BACKFILL_MAX_PAGES; page += 1) {
      const result = await dograh.listWorkflowRuns(
        workflowId,
        page,
        RUNS_PAGE_LIMIT,
      );
      const runs = result.runs.filter((run) => run.is_completed);
      for (const run of runs) {
        const caller = withCallerId(extractCaller(run), run);
        await recordCall(mapping.businessId, run, caller, null);
        written += 1;
      }
      if (page >= result.total_pages || result.runs.length === 0) break;
    }
  }
  return written;
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

/**
 * How long a call lasted, in seconds.
 *
 * The engine reports this under `usage_info`. `cost_info` is read as a fallback
 * only because older runs may carry it there — on current runs it comes back as
 * an empty object, which is why every call in the product showed no duration at
 * all until this was corrected.
 */
export function runDurationSeconds(run: DograhWorkflowRun): number | null {
  const value =
    run.usage_info?.call_duration_seconds ?? run.cost_info?.call_duration_seconds;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

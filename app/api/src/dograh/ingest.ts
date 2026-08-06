import { randomUUID } from "node:crypto";

import { and, eq, isNull, or } from "drizzle-orm";

import { db } from "../db/client";
import {
  businessDograhMappings,
  callbackTasks,
  contacts,
  knowledgeGaps,
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
  return {
    caller:
      hasCallerSignal(contextCaller) || !variables
        ? contextCaller
        : callerFromContext(variables),
    gaps: variables ? gapsFromContext(variables) : [],
  };
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
    await upsertCallContact(businessId, caller);
    await createCallCallback(businessId, run, caller);
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

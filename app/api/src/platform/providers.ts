/**
 * Keeps Dograh's organisation model configuration in step with the API keys in
 * the environment.
 *
 * Before this existed the operator had to open the Dograh dashboard and paste
 * STT/LLM/TTS keys by hand, and nothing in Vocalonix knew whether they had. Now
 * the API reconciles at boot and on demand: it resolves a stack from the keys,
 * pushes it, and records the result so the readiness panel can tell the
 * operator exactly what is missing.
 *
 * Dograh validates keys against the real provider APIs on save, so a rejected
 * push is a genuine "this key does not work" signal worth surfacing verbatim.
 */

import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "../db/client";
import { platformSettings } from "../db/schema";
import { dograh, DograhError } from "../dograh/client";
import type { DograhManagementClient } from "../dograh/client";
import { env } from "../env";
import {
  modelConfigurationPayload,
  resolveVoiceStack,
  stackSupportsPerBusinessVoice,
  type ResolvedVoiceStack,
} from "./voiceStack";

const SETTINGS_KEY = "dograh.model_configuration";

export interface ProviderStatus {
  configured: boolean;
  mode: "pipeline" | "realtime" | null;
  summary: string | null;
  perBusinessVoice: boolean;
  /** Set when the keys are incomplete. */
  reason?: string;
  missing?: string[];
  /** Set when a push was attempted and Dograh refused it. */
  lastError?: string;
  lastSyncedAt?: string;
}

function configurationHash(payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/**
 * Dograh checks OpenAI, Deepgram and ElevenLabs keys against the real APIs on
 * save, but accepts Google keys without looking (`_check_google_api_key`
 * returns true unconditionally). A Gemini-only operator would then see a green
 * readiness panel and a silently broken first call, so that one gap is closed
 * here.
 */
async function verifyGoogleKey(apiKey: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
      { headers: { "x-goog-api-key": apiKey }, signal: controller.signal },
    );
    if (response.ok) return null;
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      return "Google rejected GEMINI_API_KEY. Check the key at https://aistudio.google.com/apikey and that the Generative Language API is enabled for it.";
    }
    return `Google could not confirm GEMINI_API_KEY (HTTP ${response.status}). Calls may still work; recheck later.`;
  } catch {
    // A network problem here says nothing about the key, so it is not an error.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyUncheckedKeys(stack: ResolvedVoiceStack): Promise<string | null> {
  const usesGoogle =
    stack.llm.provider === "google" ||
    stack.realtime?.provider === "google_realtime";
  if (!usesGoogle) return null;
  const key = env.geminiApiKey;
  if (!key) return null;
  return verifyGoogleKey(key);
}

interface StoredState extends Record<string, unknown> {
  hash?: string;
  lastError?: string | null;
  lastSyncedAt?: string | null;
}

async function readState(): Promise<StoredState> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, SETTINGS_KEY))
    .limit(1);
  return (row?.value as StoredState | undefined) ?? {};
}

async function writeState(state: StoredState): Promise<void> {
  await db
    .insert(platformSettings)
    .values({ key: SETTINGS_KEY, value: state, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: { value: state, updatedAt: new Date() },
    });
}

export interface ReconcileResult {
  changed: boolean;
  status: ProviderStatus;
}

/**
 * Pushes the resolved configuration when its hash changed, or when a previous
 * push failed. `force` re-pushes regardless, which is what the operator's
 * "recheck" button needs after rotating a key to the same shape.
 */
export async function reconcileProviderConfiguration(
  options: { force?: boolean; client?: DograhManagementClient } = {},
): Promise<ReconcileResult> {
  const client = options.client ?? dograh;
  const stack = resolveVoiceStack();

  if (!stack.ok) {
    await writeState({ lastError: null, lastSyncedAt: null });
    return {
      changed: false,
      status: {
        configured: false,
        mode: null,
        summary: null,
        perBusinessVoice: false,
        reason: stack.reason,
        missing: stack.missing,
      },
    };
  }

  const payload = modelConfigurationPayload(stack);
  const hash = configurationHash(payload);
  const state = await readState();
  const upToDate = state.hash === hash && !state.lastError;

  if (upToDate && !options.force) {
    return { changed: false, status: statusFor(stack, state) };
  }

  try {
    await client.saveModelConfiguration(payload);
  } catch (error) {
    const message =
      error instanceof DograhError
        ? error.message
        : "The voice engine rejected the provider configuration.";
    // Keep the old hash: the next attempt should still be treated as a change.
    await writeState({ ...state, lastError: message });
    console.error("Provider configuration push failed:", message);
    return {
      changed: false,
      status: { ...statusFor(stack, state), lastError: message },
    };
  }

  const unchecked = await verifyUncheckedKeys(stack);
  const next: StoredState = {
    hash,
    lastError: unchecked,
    lastSyncedAt: new Date().toISOString(),
  };
  await writeState(next);
  if (unchecked) {
    console.error(`Dograh provider configuration saved with a warning: ${unchecked}`);
  } else {
    console.log(`Dograh provider configuration synced: ${stack.summary}`);
  }
  return { changed: true, status: statusFor(stack, next) };
}

function statusFor(stack: ResolvedVoiceStack, state: StoredState): ProviderStatus {
  return {
    configured: true,
    mode: stack.mode,
    summary: stack.summary,
    perBusinessVoice: stackSupportsPerBusinessVoice(stack),
    ...(state.lastError ? { lastError: state.lastError } : {}),
    ...(state.lastSyncedAt ? { lastSyncedAt: state.lastSyncedAt } : {}),
  };
}

/** Read-only view for the readiness panel — never talks to Dograh. */
export async function providerStatus(): Promise<ProviderStatus> {
  const stack = resolveVoiceStack();
  if (!stack.ok) {
    return {
      configured: false,
      mode: null,
      summary: null,
      perBusinessVoice: false,
      reason: stack.reason,
      missing: stack.missing,
    };
  }
  return statusFor(stack, await readState());
}

/**
 * The per-workflow model override that gives one business its own voice.
 * Returns null when the stack cannot vary voices, so the caller omits the key
 * entirely and the workflow inherits the organisation configuration.
 */
export function businessVoiceOverride(
  voiceId: string | null,
): Record<string, unknown> | null {
  const stack = resolveVoiceStack();
  if (!stack.ok || !stackSupportsPerBusinessVoice(stack)) return null;
  return modelConfigurationPayload(stack, voiceId);
}

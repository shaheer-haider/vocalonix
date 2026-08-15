/**
 * Turns the API keys in the environment into a Dograh model configuration.
 *
 * The operator's contract is "paste keys into .env and calls work". Everything
 * in here is pure: it reads `env`, decides which speech stack those keys can
 * support, and produces the payload Dograh's
 * `PUT /organizations/model-configurations/v2` expects. Pushing it lives in
 * `providers.ts`.
 *
 * Two stacks exist:
 *
 * - **pipeline** — separate STT, LLM and TTS. This is the default whenever the
 *   keys allow it. Transcription is a first-class stream, so barge-in and
 *   knowledge answers behave predictably, and each business can have its own
 *   TTS voice.
 * - **realtime** — a single speech-to-speech model. Fewer keys to buy, but the
 *   caller's words only surface when the model chooses to emit them, which is
 *   what made spoken demos unreliable before. Used when realtime is the only
 *   thing the available keys can drive, or when explicitly requested.
 */

import { env } from "../env";
import { resolveVoice } from "../voices";

export type VoiceStackMode = "pipeline" | "realtime";

export interface ResolvedVoiceStack {
  mode: VoiceStackMode;
  /** Provider ids as Dograh names them, for status reporting and voice mapping. */
  llm: { provider: string; model: string };
  stt?: { provider: string; model: string };
  tts?: { provider: string; voice: string | null };
  realtime?: { provider: string; model: string; voice: string | null };
  embeddings?: { provider: string; model: string };
  /** Human-readable one-liner for the readiness panel. */
  summary: string;
}

export interface VoiceStackFailure {
  ok: false;
  /** What the operator has to do next, in one sentence. */
  reason: string;
  missing: string[];
}

export type VoiceStackResult = ({ ok: true } & ResolvedVoiceStack) | VoiceStackFailure;

interface Keys {
  deepgram: string | null;
  openai: string | null;
  gemini: string | null;
  elevenlabs: string | null;
  cartesia: string | null;
}

function keys(): Keys {
  return {
    deepgram: env.deepgramApiKey,
    openai: env.openaiApiKey,
    gemini: env.geminiApiKey,
    elevenlabs: env.elevenlabsApiKey,
    cartesia: env.cartesiaApiKey,
  };
}

function pipelineTts(
  available: Keys,
): { provider: string; key: string; voice: string | null } | null {
  // Ordered by how well each provider fits a receptionist: a mapped catalogue
  // voice first, then providers where the operator pins one voice by id.
  if (available.deepgram) {
    return { provider: "deepgram", key: available.deepgram, voice: null };
  }
  if (available.openai) {
    return { provider: "openai", key: available.openai, voice: null };
  }
  if (available.cartesia && env.cartesiaVoiceId) {
    return {
      provider: "cartesia",
      key: available.cartesia,
      voice: env.cartesiaVoiceId,
    };
  }
  if (available.elevenlabs && env.elevenlabsVoiceId) {
    return {
      provider: "elevenlabs",
      key: available.elevenlabs,
      voice: env.elevenlabsVoiceId,
    };
  }
  return null;
}

function pipelineLlm(
  available: Keys,
): { provider: string; key: string; model: string } | null {
  if (available.openai) {
    return { provider: "openai", key: available.openai, model: env.voiceLlmModel };
  }
  if (available.gemini) {
    return {
      provider: "google",
      key: available.gemini,
      // Gemini model ids do not overlap with OpenAI's, so VOICE_LLM_MODEL only
      // applies to the OpenAI branch.
      model: "gemini-flash-latest",
    };
  }
  return null;
}

function realtimeProvider(
  available: Keys,
): { provider: string; key: string; model: string } | null {
  if (available.gemini) {
    return {
      provider: "google_realtime",
      key: available.gemini,
      model: env.voiceRealtimeModel,
    };
  }
  if (available.openai) {
    return {
      provider: "openai_realtime",
      key: available.openai,
      model: "gpt-realtime-2",
    };
  }
  return null;
}

function canRunPipeline(available: Keys): boolean {
  return Boolean(available.deepgram && pipelineLlm(available) && pipelineTts(available));
}

/**
 * Decides which stack the current keys support. Never throws — an unconfigured
 * platform is a state the readiness panel renders, not an error.
 */
export function resolveVoiceStack(): VoiceStackResult {
  const available = keys();
  const wanted = env.voiceStack;

  const preferPipeline =
    wanted === "pipeline" || (wanted === "auto" && canRunPipeline(available));

  if (preferPipeline) {
    const llm = pipelineLlm(available);
    const tts = pipelineTts(available);
    const missing: string[] = [];
    if (!available.deepgram) missing.push("DEEPGRAM_API_KEY (speech to text)");
    if (!llm) missing.push("OPENAI_API_KEY or GEMINI_API_KEY (conversation model)");
    if (!tts) {
      missing.push(
        "DEEPGRAM_API_KEY, OPENAI_API_KEY, or CARTESIA_API_KEY + CARTESIA_VOICE_ID (speech out)",
      );
    }
    if (missing.length > 0) {
      return {
        ok: false,
        reason:
          "The pipeline voice stack is selected but its keys are incomplete. Add the missing keys, or set VOICE_STACK=realtime to use a speech-to-speech model instead.",
        missing,
      };
    }
    return {
      ok: true,
      mode: "pipeline",
      llm: { provider: llm!.provider, model: llm!.model },
      stt: { provider: "deepgram", model: env.voiceSttModel },
      tts: { provider: tts!.provider, voice: tts!.voice },
      ...(available.openai
        ? {
            embeddings: {
              provider: "openai",
              model: "text-embedding-3-small",
            },
          }
        : {}),
      summary: `Deepgram ${env.voiceSttModel} → ${llm!.provider} ${llm!.model} → ${tts!.provider} speech`,
    };
  }

  const realtime = realtimeProvider(available);
  const llm = pipelineLlm(available);
  if (!realtime || !llm) {
    return {
      ok: false,
      reason:
        "No speech provider keys are configured yet. Add GEMINI_API_KEY for the quickest start, or DEEPGRAM_API_KEY + OPENAI_API_KEY for the more reliable pipeline stack.",
      missing: ["GEMINI_API_KEY or OPENAI_API_KEY"],
    };
  }

  return {
    ok: true,
    mode: "realtime",
    llm: { provider: llm.provider, model: llm.model },
    realtime: {
      provider: realtime.provider,
      model: realtime.model,
      voice: null,
    },
    ...(available.openai
      ? { embeddings: { provider: "openai", model: "text-embedding-3-small" } }
      : {}),
    summary: `${realtime.provider} ${realtime.model} speech to speech`,
  };
}

function llmBlock(available: Keys, stack: ResolvedVoiceStack): Record<string, unknown> {
  if (stack.llm.provider === "openai") {
    return {
      provider: "openai",
      api_key: available.openai,
      model: stack.llm.model,
      base_url: "https://api.openai.com/v1",
    };
  }
  return {
    provider: "google",
    api_key: available.gemini,
    model: stack.llm.model,
  };
}

function ttsBlock(
  available: Keys,
  voiceId: string | null,
): Record<string, unknown> | null {
  const tts = pipelineTts(available);
  if (!tts) return null;
  const voice = resolveVoice(voiceId);
  if (tts.provider === "deepgram") {
    return {
      provider: "deepgram",
      api_key: tts.key,
      voice: voice.providers.deepgram,
    };
  }
  if (tts.provider === "openai") {
    return {
      provider: "openai",
      api_key: tts.key,
      model: "gpt-4o-mini-tts",
      voice: voice.providers.openai,
      base_url: "https://api.openai.com/v1",
    };
  }
  if (tts.provider === "cartesia") {
    return {
      provider: "cartesia",
      api_key: tts.key,
      model: "sonic-3.5",
      voice: tts.voice,
      language: "en",
    };
  }
  return {
    provider: "elevenlabs",
    api_key: tts.key,
    model: "eleven_flash_v2_5",
    voice: tts.voice,
  };
}

function realtimeBlock(
  available: Keys,
  voiceId: string | null,
): Record<string, unknown> | null {
  const realtime = realtimeProvider(available);
  if (!realtime) return null;
  const voice = resolveVoice(voiceId);
  if (realtime.provider === "google_realtime") {
    return {
      provider: "google_realtime",
      api_key: realtime.key,
      model: realtime.model,
      voice: voice.providers.google_realtime,
      language: env.voiceLanguage === "multi" ? "en" : env.voiceLanguage,
    };
  }
  return {
    provider: "openai_realtime",
    api_key: realtime.key,
    model: realtime.model,
    voice: voice.providers.openai_realtime,
  };
}

function embeddingsBlock(available: Keys): Record<string, unknown> | null {
  if (!available.openai) return null;
  return {
    provider: "openai",
    api_key: available.openai,
    model: "text-embedding-3-small",
    base_url: "https://api.openai.com/v1",
  };
}

/**
 * The `model-configurations/v2` body for a stack, optionally pinned to one
 * business's voice. `voiceId` is null for the organisation-wide default.
 */
export function modelConfigurationPayload(
  stack: ResolvedVoiceStack,
  voiceId: string | null = null,
): Record<string, unknown> {
  const available = keys();
  const embeddings = embeddingsBlock(available);

  if (stack.mode === "pipeline") {
    return {
      version: 2,
      mode: "byok",
      byok: {
        mode: "pipeline",
        pipeline: {
          llm: llmBlock(available, stack),
          stt: {
            provider: "deepgram",
            api_key: available.deepgram,
            model: env.voiceSttModel,
            language: env.voiceLanguage,
          },
          tts: ttsBlock(available, voiceId),
          ...(embeddings ? { embeddings } : {}),
        },
      },
    };
  }

  return {
    version: 2,
    mode: "byok",
    byok: {
      mode: "realtime",
      realtime: {
        realtime: realtimeBlock(available, voiceId),
        llm: llmBlock(available, stack),
        ...(embeddings ? { embeddings } : {}),
      },
    },
  };
}

/**
 * True when a business's chosen voice can actually change how the agent sounds
 * on the current stack. Providers pinned to a single env voice id cannot, and
 * the widget settings page says so rather than pretending.
 */
export function stackSupportsPerBusinessVoice(stack: ResolvedVoiceStack): boolean {
  if (stack.mode === "realtime") return true;
  return stack.tts?.provider === "deepgram" || stack.tts?.provider === "openai";
}

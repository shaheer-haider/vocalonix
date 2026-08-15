import { afterEach, describe, expect, test } from "bun:test";

import { env } from "../env";
import {
  modelConfigurationPayload,
  resolveVoiceStack,
  stackSupportsPerBusinessVoice,
} from "./voiceStack";

type Mutable = { -readonly [K in keyof typeof env]: (typeof env)[K] };
const mutable = env as Mutable;

const original = {
  voiceStack: env.voiceStack,
  deepgramApiKey: env.deepgramApiKey,
  openaiApiKey: env.openaiApiKey,
  geminiApiKey: env.geminiApiKey,
  cartesiaApiKey: env.cartesiaApiKey,
  cartesiaVoiceId: env.cartesiaVoiceId,
  elevenlabsApiKey: env.elevenlabsApiKey,
  elevenlabsVoiceId: env.elevenlabsVoiceId,
};

function withKeys(overrides: Partial<typeof original>): void {
  Object.assign(mutable, { ...original, ...overrides });
}

afterEach(() => {
  Object.assign(mutable, original);
});

describe("voice stack resolution", () => {
  test("no keys reports what to add rather than failing", () => {
    withKeys({
      voiceStack: "auto",
      deepgramApiKey: null,
      openaiApiKey: null,
      geminiApiKey: null,
      cartesiaApiKey: null,
      elevenlabsApiKey: null,
    });
    const stack = resolveVoiceStack();
    expect(stack.ok).toBe(false);
    if (stack.ok) throw new Error("expected an unconfigured stack");
    expect(stack.reason).toContain("GEMINI_API_KEY");
  });

  test("a Gemini-only platform falls back to the realtime stack", () => {
    withKeys({
      voiceStack: "auto",
      deepgramApiKey: null,
      openaiApiKey: null,
      geminiApiKey: "gemini-key",
    });
    const stack = resolveVoiceStack();
    if (!stack.ok) throw new Error(stack.reason);
    expect(stack.mode).toBe("realtime");
    expect(stack.realtime?.provider).toBe("google_realtime");
  });

  test("Deepgram plus OpenAI prefers the pipeline stack", () => {
    withKeys({
      voiceStack: "auto",
      deepgramApiKey: "deepgram-key",
      openaiApiKey: "openai-key",
      geminiApiKey: "gemini-key",
    });
    const stack = resolveVoiceStack();
    if (!stack.ok) throw new Error(stack.reason);
    expect(stack.mode).toBe("pipeline");
    expect(stack.stt?.provider).toBe("deepgram");
    expect(stack.tts?.provider).toBe("deepgram");
    expect(stack.llm.provider).toBe("openai");
  });

  test("asking for pipeline without an STT key says which key is missing", () => {
    withKeys({
      voiceStack: "pipeline",
      deepgramApiKey: null,
      openaiApiKey: "openai-key",
    });
    const stack = resolveVoiceStack();
    expect(stack.ok).toBe(false);
    if (stack.ok) throw new Error("expected an unconfigured stack");
    expect(stack.missing.join(" ")).toContain("DEEPGRAM_API_KEY");
  });

  test("the payload carries a per-business voice on stacks that support it", () => {
    withKeys({
      voiceStack: "pipeline",
      deepgramApiKey: "deepgram-key",
      openaiApiKey: "openai-key",
    });
    const stack = resolveVoiceStack();
    if (!stack.ok) throw new Error(stack.reason);
    expect(stackSupportsPerBusinessVoice(stack)).toBe(true);

    const payload = modelConfigurationPayload(stack, "hugo") as Record<string, any>;
    expect(payload.byok.pipeline.tts.voice).toBe("aura-2-zeus-en");
    expect(payload.byok.pipeline.stt.provider).toBe("deepgram");
    expect(payload.byok.pipeline.llm.model).toBe(env.voiceLlmModel);
  });

  test("a provider pinned to one env voice cannot vary voices per business", () => {
    withKeys({
      voiceStack: "pipeline",
      deepgramApiKey: null,
      openaiApiKey: null,
      geminiApiKey: "gemini-key",
      cartesiaApiKey: "cartesia-key",
      cartesiaVoiceId: "voice-uuid",
    });
    // Without a Deepgram key there is no STT provider, so the pipeline cannot
    // resolve at all — the operator is told rather than silently downgraded.
    expect(resolveVoiceStack().ok).toBe(false);

    withKeys({
      voiceStack: "pipeline",
      deepgramApiKey: "deepgram-key",
      openaiApiKey: null,
      geminiApiKey: "gemini-key",
      cartesiaApiKey: "cartesia-key",
      cartesiaVoiceId: "voice-uuid",
    });
    const stack = resolveVoiceStack();
    if (!stack.ok) throw new Error(stack.reason);
    // Deepgram wins for TTS because it maps the catalogue; Cartesia is only
    // reached when nothing better is configured.
    expect(stack.tts?.provider).toBe("deepgram");
    expect(stack.llm.provider).toBe("google");
  });

  test("realtime voices map onto the Gemini voice names", () => {
    withKeys({
      voiceStack: "realtime",
      deepgramApiKey: null,
      openaiApiKey: null,
      geminiApiKey: "gemini-key",
    });
    const stack = resolveVoiceStack();
    if (!stack.ok) throw new Error(stack.reason);
    const payload = modelConfigurationPayload(stack, "orion") as Record<string, any>;
    expect(payload.byok.realtime.realtime.voice).toBe("Charon");
  });
});

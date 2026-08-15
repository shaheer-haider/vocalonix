import { describe, expect, test } from "bun:test";

import { DEFAULT_VOICE_ID, VOICES, resolveVoice, voiceForProvider } from "./voices";

describe("voice catalogue", () => {
  test("every voice maps to every provider it claims", () => {
    for (const voice of VOICES) {
      expect(voice.providers.deepgram).toMatch(/^aura-2-[a-z]+-en$/);
      expect(voice.providers.openai).toBeTruthy();
      expect(voice.providers.google_realtime).toBeTruthy();
      expect(voice.preview).toMatch(/^[a-z]+$/);
    }
  });

  test("voice ids are unique", () => {
    expect(new Set(VOICES.map((voice) => voice.id)).size).toBe(VOICES.length);
  });

  test("unknown and empty selections fall back to the default", () => {
    expect(resolveVoice(null).id).toBe(DEFAULT_VOICE_ID);
    expect(resolveVoice("").id).toBe(DEFAULT_VOICE_ID);
    expect(resolveVoice("something-else").id).toBe(DEFAULT_VOICE_ID);
  });

  test("settings written before the catalogue still resolve", () => {
    // "natural" was the old column default; "Puck" came from the demo funnel
    // storing a raw Gemini voice name.
    expect(resolveVoice("natural").id).toBe(DEFAULT_VOICE_ID);
    expect(resolveVoice("Puck").id).toBe("atlas");
    expect(resolveVoice("aoede").id).toBe("aria");
  });

  test("a provider with no mapping returns null instead of a guess", () => {
    expect(voiceForProvider("aria", "deepgram")).toBe("aura-2-helena-en");
    expect(voiceForProvider("aria", "cartesia")).toBeNull();
  });
});

/**
 * The voice catalogue every business picks from.
 *
 * A voice is a Harkbell-level identity ("Aria, warm and caring"), not a
 * provider voice id. Each entry carries the closest equivalent on every voice
 * provider we can drive, so a business keeps the same voice when the operator
 * switches the platform from, say, Gemini realtime to a Deepgram pipeline.
 *
 * Providers whose voices are opaque UUIDs (ElevenLabs, Cartesia) are not
 * mapped: those stacks use the single voice configured in the environment and
 * `voiceForProvider` returns null so the caller leaves the provider default in
 * place rather than sending an invented id.
 */

export interface VoiceOption {
  id: string;
  label: string;
  /** Shown under the label in the picker. */
  description: string;
  gender: "female" | "male";
  /** Preview asset under `app/web/public/voices/`. */
  preview: string;
  providers: {
    deepgram: string;
    openai: string;
    openai_realtime: string;
    google_realtime: string;
  };
}

export const VOICES: VoiceOption[] = [
  {
    id: "aria",
    label: "Aria",
    description: "Warm and caring. The default front-desk voice.",
    gender: "female",
    preview: "aoede",
    providers: {
      deepgram: "aura-2-helena-en",
      openai: "shimmer",
      openai_realtime: "shimmer",
      google_realtime: "Aoede",
    },
  },
  {
    id: "nova",
    label: "Nova",
    description: "Clear and knowledgeable. Good for busy clinics.",
    gender: "female",
    preview: "kore",
    providers: {
      deepgram: "aura-2-asteria-en",
      openai: "sage",
      openai_realtime: "sage",
      google_realtime: "Kore",
    },
  },
  {
    id: "sage",
    label: "Sage",
    description: "Calm and professional. Reassuring on difficult calls.",
    gender: "female",
    preview: "leda",
    providers: {
      deepgram: "aura-2-athena-en",
      openai: "coral",
      openai_realtime: "coral",
      google_realtime: "Leda",
    },
  },
  {
    id: "iris",
    label: "Iris",
    description: "Bright and enthusiastic. Suits salons and studios.",
    gender: "female",
    preview: "zephyr",
    providers: {
      deepgram: "aura-2-thalia-en",
      openai: "ballad",
      openai_realtime: "ballad",
      google_realtime: "Zephyr",
    },
  },
  {
    id: "atlas",
    label: "Atlas",
    description: "Approachable and calm. An easy male voice to listen to.",
    gender: "male",
    preview: "puck",
    providers: {
      deepgram: "aura-2-orion-en",
      openai: "ash",
      openai_realtime: "ash",
      google_realtime: "Puck",
    },
  },
  {
    id: "orion",
    label: "Orion",
    description: "Confident and comfortable. Works well for trades.",
    gender: "male",
    preview: "charon",
    providers: {
      deepgram: "aura-2-apollo-en",
      openai: "echo",
      openai_realtime: "echo",
      google_realtime: "Charon",
    },
  },
  {
    id: "felix",
    label: "Felix",
    description: "Energetic and upbeat. Keeps quick calls moving.",
    gender: "male",
    preview: "fenrir",
    providers: {
      deepgram: "aura-2-atlas-en",
      openai: "verse",
      openai_realtime: "verse",
      google_realtime: "Fenrir",
    },
  },
  {
    id: "hugo",
    label: "Hugo",
    description: "Deep and trustworthy. Steady on long calls.",
    gender: "male",
    preview: "orus",
    providers: {
      deepgram: "aura-2-zeus-en",
      openai: "alloy",
      openai_realtime: "alloy",
      google_realtime: "Orus",
    },
  },
];

export const DEFAULT_VOICE_ID = "aria";

const byId = new Map(VOICES.map((voice) => [voice.id, voice]));

/**
 * Businesses created before the catalogue existed stored free text ("natural")
 * or a raw Gemini voice name ("Puck"). Both still have to resolve to something
 * sensible rather than dropping the agent's voice on the next sync.
 */
export function resolveVoice(value: string | null | undefined): VoiceOption {
  const wanted = (value ?? "").trim().toLowerCase();
  if (!wanted) return byId.get(DEFAULT_VOICE_ID)!;
  const direct = byId.get(wanted);
  if (direct) return direct;
  const legacy = VOICES.find(
    (voice) =>
      voice.preview === wanted ||
      voice.providers.google_realtime.toLowerCase() === wanted,
  );
  return legacy ?? byId.get(DEFAULT_VOICE_ID)!;
}

export function voiceForProvider(
  voiceId: string | null | undefined,
  provider: string,
): string | null {
  const voice = resolveVoice(voiceId);
  const mapping = voice.providers as Record<string, string | undefined>;
  return mapping[provider] ?? null;
}

/** The public shape the web app renders in the voice picker. */
export function voiceCatalogue() {
  return VOICES.map((voice) => ({
    id: voice.id,
    label: voice.label,
    description: voice.description,
    gender: voice.gender,
    preview: `/voices/${voice.preview}.m4a`,
  }));
}

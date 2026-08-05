import { env } from "../env";

const EXTRACTION_TIMEOUT_MS = 30_000;

const EXTRACTION_PROMPT =
  "You are reading the transcript of a phone call between a business's AI receptionist (assistant) and a caller (user). " +
  "Speech recognition is imperfect, so caller lines may contain garbled words; use the assistant's confirmations to resolve them. " +
  "Extract who the caller is and whether they asked to be called back. " +
  "Only use what the caller actually said or the assistant explicitly confirmed; leave anything unstated empty.";

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    caller_name: {
      type: "string",
      description: "The caller's name, exactly as they gave it.",
    },
    caller_phone: {
      type: "string",
      description: "A phone number the caller gave for contacting them.",
    },
    caller_email: {
      type: "string",
      description: "An email address the caller gave for contacting them.",
    },
    callback_requested: {
      type: "boolean",
      description:
        "True if the caller asked to be called back, asked for a human to follow up, or was promised a follow-up.",
    },
    callback_reason: {
      type: "string",
      description: "A one-sentence reason the caller needs a callback.",
    },
  },
  required: ["callback_requested"],
} as const;

export function transcriptHasCallerTurns(transcript: string): boolean {
  return /^\[[^\]]*\] user:/m.test(transcript);
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] | null } | null;
  }[];
}

export function parseExtractionText(
  response: GeminiResponse,
): Record<string, unknown> | null {
  const text = (response.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("");
  if (!text.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export async function extractVariablesFromTranscript(
  transcript: string,
): Promise<Record<string, unknown> | null> {
  if (!env.geminiApiKey) return null;
  if (!transcriptHasCallerTurns(transcript)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiExtractionModel}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.geminiApiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: `${EXTRACTION_PROMPT}\n\nTranscript:\n${transcript}` }],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: EXTRACTION_SCHEMA,
          },
        }),
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      console.error(
        `Transcript extraction request failed with status ${response.status}`,
      );
      return null;
    }
    return parseExtractionText((await response.json()) as GeminiResponse);
  } catch (caught) {
    console.error("Transcript extraction request failed:", caught);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

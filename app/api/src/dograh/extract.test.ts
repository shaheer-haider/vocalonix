import { describe, expect, it } from "bun:test";

import { parseExtractionText, transcriptHasCallerTurns } from "./extract";

describe("transcriptHasCallerTurns", () => {
  it("detects caller turns in a Dograh transcript", () => {
    const transcript = [
      "[2026-08-05T23:00:55.773+00:00] assistant: Hi, thanks for visiting.",
      "[2026-08-05T23:02:02.440+00:00] user: My name is Marcus Bell",
    ].join("\n");
    expect(transcriptHasCallerTurns(transcript)).toBe(true);
  });

  it("returns false when the caller never spoke", () => {
    const transcript = [
      "[2026-08-05T23:00:55.773+00:00] assistant: Hi, thanks for visiting.",
      "[2026-08-05T23:01:55.773+00:00] assistant: Are you still there?",
    ].join("\n");
    expect(transcriptHasCallerTurns(transcript)).toBe(false);
  });

  it("returns false for an empty transcript", () => {
    expect(transcriptHasCallerTurns("")).toBe(false);
  });
});

describe("parseExtractionText", () => {
  it("parses a JSON object from the first candidate", () => {
    const parsed = parseExtractionText({
      candidates: [
        {
          content: {
            parts: [
              { text: '{"caller_name":"Marcus Bell",' },
              { text: '"callback_requested":true}' },
            ],
          },
        },
      ],
    });
    expect(parsed).toEqual({
      caller_name: "Marcus Bell",
      callback_requested: true,
    });
  });

  it("returns null when the response has no text", () => {
    expect(parseExtractionText({ candidates: [] })).toBeNull();
    expect(parseExtractionText({})).toBeNull();
  });

  it("returns null for non-JSON or non-object text", () => {
    expect(
      parseExtractionText({
        candidates: [{ content: { parts: [{ text: "not json" }] } }],
      }),
    ).toBeNull();
    expect(
      parseExtractionText({
        candidates: [{ content: { parts: [{ text: "[1,2]" }] } }],
      }),
    ).toBeNull();
  });
});

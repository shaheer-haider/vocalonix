import { describe, expect, test } from "bun:test";

import { DograhError } from "./client";
import { classifyDograhFailure } from "./errors";

describe("Dograh failure classification", () => {
  test("transient failures remain retryable without losing local saves", () => {
    expect(classifyDograhFailure(new DograhError("timeout", 503))).toEqual({
      category: "unreachable",
      message:
        "The voice engine is temporarily unavailable. Harkbell saved the local changes and will retry.",
      retryable: true,
    });
  });

  test("authentication and missing resources do not auto-loop", () => {
    expect(classifyDograhFailure(new DograhError("denied", 401))).toMatchObject({
      category: "unauthorized",
      retryable: false,
    });
    expect(classifyDograhFailure(new DograhError("gone", 404))).toMatchObject({
      category: "not_found",
      retryable: false,
    });
  });

  test("configuration rejection is actionable and removes credential details", () => {
    const failure = classifyDograhFailure(
      new DograhError(
        "Invalid node at https://dograh.internal/workflow token=secret-value",
        422,
      ),
    );
    expect(failure.category).toBe("rejected");
    expect(failure.retryable).toBe(false);
    expect(failure.message).toContain("The voice engine rejected this configuration");
    expect(failure.message).not.toContain("dograh.internal");
    expect(failure.message).not.toContain("secret-value");
  });

  // The rejection branch is the one path that quotes the engine's own words
  // back to the user, so it is the one that can leak the vendor's name into
  // the UI however carefully the surrounding sentences are written.
  test("the engine's name never reaches a message the UI shows", () => {
    const failure = classifyDograhFailure(
      new DograhError("Dograh could not parse the workflow sent by DOGRAH", 400),
    );
    expect(failure.message).not.toMatch(/dograh/i);
    expect(failure.message).toContain("the voice engine");
  });
});

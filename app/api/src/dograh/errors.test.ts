import { describe, expect, test } from "bun:test";

import { DograhError } from "./client";
import { classifyDograhFailure } from "./errors";

describe("Dograh failure classification", () => {
  test("transient failures remain retryable without losing local saves", () => {
    expect(classifyDograhFailure(new DograhError("timeout", 503))).toEqual({
      category: "unreachable",
      message:
        "Dograh is temporarily unavailable. Vocalonix saved the local changes and will retry.",
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
    expect(failure.message).toContain("Dograh rejected this configuration");
    expect(failure.message).not.toContain("dograh.internal");
    expect(failure.message).not.toContain("secret-value");
  });
});

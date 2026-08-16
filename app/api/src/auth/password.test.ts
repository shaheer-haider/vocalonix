import { hashPassword } from "better-auth/crypto";
import { describe, expect, test } from "bun:test";

import { ApiError } from "../errors";
import { requirePasswordConfirmation } from "./password";

/**
 * Each test uses its own user id because the rate limiter keys on it and holds
 * state across the suite.
 */
let seq = 0;
function userId(): string {
  seq += 1;
  return `user-${seq}-${Math.random().toString(36).slice(2)}`;
}

async function withPassword(plain: string) {
  const hash = await hashPassword(plain);
  return async () => hash;
}

async function expectApiError(
  run: () => Promise<unknown>,
  code: string,
  status: number,
): Promise<void> {
  try {
    await run();
    throw new Error(`expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe(code);
    expect((error as ApiError).status).toBe(status);
  }
}

describe("confirming a password before an expensive action", () => {
  test("accepts the account's real password", async () => {
    const load = await withPassword("correct horse battery");
    await expect(
      requirePasswordConfirmation(userId(), "correct horse battery", load),
    ).resolves.toBeUndefined();
  });

  test("rejects a wrong password", async () => {
    const load = await withPassword("correct horse battery");
    await expectApiError(
      () => requirePasswordConfirmation(userId(), "wrong", load),
      "PASSWORD_INCORRECT",
      403,
    );
  });

  test("rejects an empty password rather than treating it as a skip", async () => {
    const load = await withPassword("correct horse battery");
    await expectApiError(
      () => requirePasswordConfirmation(userId(), "", load),
      "PASSWORD_INCORRECT",
      403,
    );
  });

  test("is case and whitespace exact", async () => {
    const load = await withPassword("correct horse battery");
    await expectApiError(
      () => requirePasswordConfirmation(userId(), "Correct Horse Battery", load),
      "PASSWORD_INCORRECT",
      403,
    );
    await expectApiError(
      () => requirePasswordConfirmation(userId(), " correct horse battery", load),
      "PASSWORD_INCORRECT",
      403,
    );
  });

  test("refuses rather than waves through an account with no password", async () => {
    // The failure that matters: if a passwordless sign-in method is ever added,
    // this must not become a confirmation that always succeeds.
    await expectApiError(
      () => requirePasswordConfirmation(userId(), "anything", async () => null),
      "PASSWORD_UNAVAILABLE",
      400,
    );
  });

  test("stops guessing after five attempts on the same account", async () => {
    // The endpoint answers whether a password is right, so it is an oracle for
    // anyone holding a stolen session cookie.
    const load = await withPassword("correct horse battery");
    const id = userId();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expectApiError(
        () => requirePasswordConfirmation(id, "wrong", load),
        "PASSWORD_INCORRECT",
        403,
      );
    }

    await expectApiError(
      () => requirePasswordConfirmation(id, "wrong", load),
      "RATE_LIMITED",
      429,
    );
  });

  test("the limit follows the account, not the guess", async () => {
    // Locked out on wrong guesses, the right password must not get through
    // either — otherwise the limit only slows an attacker who never guesses
    // correctly.
    const load = await withPassword("correct horse battery");
    const id = userId();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await requirePasswordConfirmation(id, "correct horse battery", load).catch(
        () => undefined,
      );
    }

    await expectApiError(
      () => requirePasswordConfirmation(id, "correct horse battery", load),
      "RATE_LIMITED",
      429,
    );
  });

  test("one account's attempts do not lock another out", async () => {
    const load = await withPassword("correct horse battery");
    const noisy = userId();
    const quiet = userId();

    for (let attempt = 0; attempt < 6; attempt += 1) {
      await requirePasswordConfirmation(noisy, "wrong", load).catch(
        () => undefined,
      );
    }

    await expect(
      requirePasswordConfirmation(quiet, "correct horse battery", load),
    ).resolves.toBeUndefined();
  });
});

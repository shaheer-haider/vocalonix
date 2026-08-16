import { verifyPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";

import { db } from "../db/client";
import { accounts } from "../db/schema";
import { ApiError } from "../errors";
import { createRateLimiter } from "../rateLimit";

/**
 * Re-authentication for actions that are expensive to undo.
 *
 * A session cookie proves who signed in; it does not prove who is at the
 * keyboard now. Asking for the password again is what separates "this browser
 * is logged in" from "this person meant to do this", which is worth having in
 * front of anything that costs money or cannot be taken back.
 */

/**
 * Every account is created through `/signup`, which requires a password, and
 * the magic-link plugin runs with `disableSignUp: true` — so there is no way to
 * end up with an account that has no password to re-enter. If a passwordless
 * sign-in method is ever added, this check has to grow a fallback rather than
 * locking those users out of their own settings.
 */
const CREDENTIAL_PROVIDER = "credential";

/**
 * An endpoint that reports whether a password is right is a guessing oracle, so
 * it is rate limited per user rather than per IP: the attacker who matters here
 * already holds a session cookie for the account they are guessing at, and can
 * change IP freely.
 */
const confirmLimiter = createRateLimiter({ limit: 5, windowMs: 60_000 });

async function storedHash(userId: string): Promise<string | null> {
  const [account] = await db
    .select({ password: accounts.password })
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, userId),
        eq(accounts.providerId, CREDENTIAL_PROVIDER),
      ),
    )
    .limit(1);
  return account?.password ?? null;
}

export async function requirePasswordConfirmation(
  userId: string,
  password: string,
  /** Injectable so the policy can be tested without a database. */
  loadHash: (userId: string) => Promise<string | null> = storedHash,
): Promise<void> {
  // Counted before the password is looked at, so a wrong guess costs an attempt
  // whether or not the account even has a password.
  confirmLimiter.check(`password-confirm:${userId}`);

  const hash = await loadHash(userId);
  if (!hash) {
    throw new ApiError(
      400,
      "PASSWORD_UNAVAILABLE",
      "This account has no password set, so it cannot confirm this action.",
    );
  }

  const matches = await verifyPassword({ hash, password });
  if (!matches) {
    throw new ApiError(
      403,
      "PASSWORD_INCORRECT",
      "That password is not right.",
    );
  }
}

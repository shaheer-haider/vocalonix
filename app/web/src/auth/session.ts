import { api, type AuthSession } from "../api";

/**
 * `GET /api/auth/session` had two independent callers — `AuthProvider`'s mount
 * effect and every guarded route's `beforeLoad` — so each page load fired the
 * same request twice, and each client-side navigation into a guarded route fired
 * another. This funnels both through one cache.
 *
 * The guard is a redirect convenience, not a security boundary: the API enforces
 * auth on every request regardless. So a short TTL is the right trade — it keeps
 * navigation off the network while bounding how long a session that expired
 * server-side (or was ended in another tab) can still wave the user through.
 */
const TTL_MS = 30_000;

let inflight: Promise<AuthSession | null> | null = null;
let cached: { value: AuthSession | null; at: number } | null = null;

export function loadSession(
  options: { force?: boolean } = {},
): Promise<AuthSession | null> {
  if (options.force) {
    cached = null;
    inflight = null;
  } else if (cached && Date.now() - cached.at < TTL_MS) {
    return Promise.resolve(cached.value);
  }

  inflight ??= api.auth
    .session()
    .then((value) => {
      cached = { value, at: Date.now() };
      return value;
    })
    .finally(() => {
      // Clear regardless of outcome: a rejection must not be replayed to the
      // next caller, and a fulfilled promise is superseded by `cached`.
      inflight = null;
    });

  return inflight;
}

/**
 * Call after anything that changes who is signed in. Passing the known session
 * seeds the cache so the next guard resolves without a round trip.
 */
export function setCachedSession(value: AuthSession | null): void {
  inflight = null;
  cached = { value, at: Date.now() };
}

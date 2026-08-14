import { ApiError } from "./errors";

interface Window {
  count: number;
  resetAt: number;
}

export interface RateLimiter {
  check(key: string): void;
}

export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return headers.get("x-real-ip") ?? "unknown";
}

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter {
  const { limit, windowMs, now = Date.now } = options;
  const windows = new Map<string, Window>();

  function sweep(current: number): void {
    if (windows.size < 10_000) return;
    for (const [key, window] of windows) {
      if (window.resetAt <= current) windows.delete(key);
    }
  }

  return {
    check(key: string): void {
      const current = now();
      sweep(current);
      const window = windows.get(key);
      if (!window || window.resetAt <= current) {
        windows.set(key, { count: 1, resetAt: current + windowMs });
        return;
      }
      window.count += 1;
      if (window.count > limit) {
        throw new ApiError(
          429,
          "RATE_LIMITED",
          "Too many requests. Try again shortly.",
        );
      }
    },
  };
}

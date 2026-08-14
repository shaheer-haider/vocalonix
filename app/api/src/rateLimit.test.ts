import { describe, expect, it } from "bun:test";

import { ApiError } from "./errors";
import { clientKey, createRateLimiter } from "./rateLimit";

describe("clientKey", () => {
  it("prefers the first x-forwarded-for entry", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.9, 10.0.0.1",
      "x-real-ip": "10.0.0.1",
    });
    expect(clientKey(headers)).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip, then unknown", () => {
    expect(clientKey(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe(
      "198.51.100.4",
    );
    expect(clientKey(new Headers())).toBe("unknown");
  });
});

describe("createRateLimiter", () => {
  it("allows requests up to the limit and rejects beyond it", () => {
    let time = 0;
    const limiter = createRateLimiter({
      limit: 3,
      windowMs: 1_000,
      now: () => time,
    });

    limiter.check("a");
    limiter.check("a");
    limiter.check("a");
    expect(() => limiter.check("a")).toThrow(ApiError);
  });

  it("tracks keys independently and resets after the window", () => {
    let time = 0;
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 1_000,
      now: () => time,
    });

    limiter.check("a");
    limiter.check("b");
    expect(() => limiter.check("a")).toThrow(ApiError);

    time = 1_001;
    limiter.check("a");
  });
});

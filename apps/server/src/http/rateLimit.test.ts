import { describe, expect, it } from "vitest";
import { UserRateLimiter } from "./rateLimit.js";

describe("UserRateLimiter", () => {
  it("allows up to max hits per window, then denies with a retry delay", () => {
    let now = 0;
    const limiter = new UserRateLimiter({ windowMs: 1_000, max: 2, now: () => now });
    expect(limiter.check("maya").allowed).toBe(true);
    expect(limiter.check("maya").allowed).toBe(true);
    const denied = limiter.check("maya");
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBe(1_000);
    now += 1_000;
    expect(limiter.check("maya").allowed).toBe(true);
  });

  it("limits each user separately", () => {
    const limiter = new UserRateLimiter({ windowMs: 60_000, max: 1 });
    expect(limiter.check("maya").allowed).toBe(true);
    expect(limiter.check("maya").allowed).toBe(false);
    expect(limiter.check("arjun").allowed).toBe(true);
  });
});

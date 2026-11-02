export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  now?: () => number;
}

/**
 * Per-user sliding-window rate limiter for the HTTP API. Keys are user ids
 * (bounded by the workspace's users, so the map needs no other eviction);
 * entries older than the window are dropped when their key is checked.
 */
export class UserRateLimiter {
  private readonly buckets = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly max: number;
  private readonly now: () => number;

  constructor(options: RateLimitOptions = {}) {
    this.windowMs = options.windowMs ?? 60_000;
    this.max = options.max ?? 300;
    this.now = options.now ?? Date.now;
  }

  /** True when the hit fits; otherwise how long until the oldest hit expires. */
  check(key: string): { allowed: boolean; retryAfterMs: number } {
    const now = this.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = [];
      this.buckets.set(key, bucket);
    }
    while (bucket.length > 0 && bucket[0]! <= now - this.windowMs) {
      bucket.shift();
    }
    if (bucket.length >= this.max) {
      return { allowed: false, retryAfterMs: bucket[0]! + this.windowMs - now };
    }
    bucket.push(now);
    return { allowed: true, retryAfterMs: 0 };
  }
}

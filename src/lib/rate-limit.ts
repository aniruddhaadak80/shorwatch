/**
 * Best-effort anonymous write throttle.
 *
 * On a serverless runtime an in-memory map is per-instance and therefore only a
 * hint. It still removes accidental bursts from one client; the authoritative
 * limit is the database, which enforces the unique constraint on
 * (watch_id, spki_sha256) and the bounded list sizes. Documented as best-effort.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60_000;

export interface RateDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window counter keyed by owner and action. `limit` is per window.
 */
export function consume(key: string, limit: number): RateDecision {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}

/** Drop expired buckets so the map cannot grow without bound. */
export function sweep(limit = 5_000): void {
  if (buckets.size <= limit) return;
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export const RATE_LIMITS = {
  /** Probes hit third-party APIs, so they are the tightest budget. */
  probe: 12,
  create: 20,
  update: 60,
  delete: 20,
  mcp: 90,
  read: 240,
} as const;
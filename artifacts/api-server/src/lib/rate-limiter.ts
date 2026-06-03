/**
 * Sliding-window in-memory rate limiter.
 * Key format: "<providerType>:<id>"  e.g. "cc", "rc:pool", "ag:user", "custom:slug"
 */

const windows = new Map<string, number[]>(); // key → timestamps of recent requests

/**
 * Returns true if the request is allowed, false if rate-limited.
 * rpmLimit = 0 means unlimited.
 */
export function checkRateLimit(key: string, rpmLimit: number): boolean {
  if (rpmLimit <= 0) return true;

  const now = Date.now();
  const windowMs = 60_000;
  const cutoff = now - windowMs;

  let timestamps = windows.get(key) ?? [];
  // Remove entries older than 1 minute
  timestamps = timestamps.filter((t) => t > cutoff);

  if (timestamps.length >= rpmLimit) {
    windows.set(key, timestamps);
    return false;
  }

  timestamps.push(now);
  windows.set(key, timestamps);
  return true;
}

/**
 * Current requests in the last 60s for a key (for display).
 */
export function getCurrentRpm(key: string): number {
  const now = Date.now();
  const cutoff = now - 60_000;
  const timestamps = windows.get(key) ?? [];
  return timestamps.filter((t) => t > cutoff).length;
}

/**
 * Penalise a key by filling its sliding window to the configured limit.
 * Call when an upstream provider returns 429 so the routing engine skips
 * it on the next request instead of hammering it again immediately.
 */
export function penalizeRateLimit(key: string, rpmLimit: number): void {
  if (rpmLimit <= 0) return; // unlimited — nothing to penalise
  const now = Date.now();
  const cutoff = now - 60_000;
  const existing = (windows.get(key) ?? []).filter((t) => t > cutoff);
  const toAdd = Math.max(0, rpmLimit - existing.length);
  windows.set(key, [...existing, ...Array<number>(toAdd).fill(now)]);
}

/**
 * Returns RPM stats for all tracked keys.
 */
export function getAllRpmStats(): Record<string, number> {
  const stats: Record<string, number> = {};
  const now = Date.now();
  const cutoff = now - 60_000;
  for (const [key, timestamps] of windows.entries()) {
    stats[key] = timestamps.filter((t) => t > cutoff).length;
  }
  return stats;
}

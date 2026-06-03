/**
 * Sliding-window in-memory rate limiter.
 * Key format: "<providerType>:<id>"  e.g. "cc", "rc:pool", "ag:user", "custom:slug"
 *
 * Two independent mechanisms:
 *  1. Sliding-window counter  — enforces the configured RPM limit (0 = unlimited).
 *  2. Temporary block map     — applied after an upstream 429, even for unlimited keys.
 *     The block expires after 60 s and is cleaned up on the next check.
 */

const windows = new Map<string, number[]>(); // key → timestamps of recent requests
const blocked = new Map<string, number>();   // key → blocked_until (ms epoch)

/**
 * Returns true if the request is allowed, false if rate-limited.
 * rpmLimit = 0 means unlimited (but the key can still be temporarily blocked).
 */
export function checkRateLimit(key: string, rpmLimit: number): boolean {
  // ── 1. Temporary block (set by penalizeRateLimit after an upstream 429) ──
  const blockedUntil = blocked.get(key);
  if (blockedUntil) {
    if (Date.now() < blockedUntil) return false;
    blocked.delete(key); // expired — clean up
  }

  // ── 2. Sliding-window counter ─────────────────────────────────────────────
  if (rpmLimit <= 0) return true; // unlimited

  const now = Date.now();
  const cutoff = now - 60_000;

  let timestamps = windows.get(key) ?? [];
  // Remove entries older than 1 minute (sliding window)
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
 * Penalise a key after an upstream 429 so the routing engine skips it
 * on the next request instead of hammering it again immediately.
 *
 * - If rpmLimit > 0: fills the sliding window to capacity so
 *   checkRateLimit returns false until old entries age out (~60 s).
 * - If rpmLimit = 0 (unlimited): sets a 60-second hard block via the
 *   blocked map, because the sliding window is never checked.
 */
export function penalizeRateLimit(key: string, rpmLimit: number): void {
  if (rpmLimit <= 0) {
    // Unlimited key — use temporary block for 60 seconds
    blocked.set(key, Date.now() + 60_000);
    return;
  }
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

/**
 * Periodic cleanup — removes stale Map entries to prevent unbounded memory growth.
 * Called automatically every 5 minutes. Safe to call manually at any time.
 */
export function cleanupRateLimiter(): void {
  const now = Date.now();
  const cutoff = now - 60_000;
  for (const [key, timestamps] of windows.entries()) {
    const alive = timestamps.filter((t) => t > cutoff);
    if (alive.length === 0) windows.delete(key);
    else windows.set(key, alive);
  }
  for (const [key, until] of blocked.entries()) {
    if (now >= until) blocked.delete(key);
  }
}

// Run cleanup automatically every 5 minutes
setInterval(cleanupRateLimiter, 5 * 60_000).unref();

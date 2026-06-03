import { db, rcKeysTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { checkRateLimit, penalizeRateLimit } from "./rate-limiter";

// ── Round-robin counter (incremented BEFORE any await — safe in single-threaded JS) ──
let rcCounter = 0;

// ── In-memory key cache (5-second TTL) ────────────────────────────────────────────
const KEY_CACHE_TTL_MS = 5_000;
let rcKeyCache: { keys: { id: string; key: string }[]; fetchedAt: number } | null = null;
let rcKeyCacheFetch: Promise<{ id: string; key: string }[]> | null = null;

async function loadRcKeys(): Promise<{ id: string; key: string }[]> {
  const now = Date.now();
  if (rcKeyCache && now - rcKeyCache.fetchedAt < KEY_CACHE_TTL_MS) return rcKeyCache.keys;
  if (rcKeyCacheFetch) return rcKeyCacheFetch;
  rcKeyCacheFetch = db
    .select({ id: rcKeysTable.id, key: rcKeysTable.key })
    .from(rcKeysTable)
    .where(and(eq(rcKeysTable.isActive, true), eq(rcKeysTable.isValid, true)))
    .then((keys) => {
      rcKeyCache = { keys, fetchedAt: Date.now() };
      return keys;
    })
    .finally(() => { rcKeyCacheFetch = null; });
  return rcKeyCacheFetch;
}

/** Invalidate the RC key cache (call after add/remove/mark-invalid operations). */
export function invalidateRcKeyCache(): void {
  rcKeyCache = null;
}

/**
 * Temporarily block an RC key for 60 s (after a 429 from upstream).
 * Uses the rate-limiter's blocked map — key never permanently invalidated.
 */
export function penalizeRcKey(id: string): void {
  penalizeRateLimit(`rc:${id}`, 0);
}

export async function getNextRcKey(): Promise<{ id: string; key: string } | null> {
  const idx = rcCounter++;
  const keys = await loadRcKeys();
  if (keys.length === 0) return null;
  // Skip keys temporarily blocked after a 429. Falls back to round-robin if all blocked.
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(idx + i) % keys.length]!;
    if (checkRateLimit(`rc:${key.id}`, 0)) return key;
  }
  return keys[idx % keys.length] ?? null;
}

export async function incrementRcKeyUsage(id: string): Promise<void> {
  await db
    .update(rcKeysTable)
    .set({ usageCount: sql`${rcKeysTable.usageCount} + 1`, lastUsedAt: new Date() })
    .where(eq(rcKeysTable.id, id));
}

export async function markRcKeyInvalid(id: string): Promise<void> {
  await db
    .update(rcKeysTable)
    .set({ isValid: false, lastCheckedAt: new Date() })
    .where(eq(rcKeysTable.id, id));
  invalidateRcKeyCache();
}

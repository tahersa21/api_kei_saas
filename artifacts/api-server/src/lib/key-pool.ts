import { db, ccKeysTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import os from "os";
import { checkRateLimit, penalizeRateLimit } from "./rate-limiter";

// ── Round-robin counter (incremented BEFORE any await — safe in single-threaded JS) ──
let counter = 0;

// ── In-memory key cache (5-second TTL) ────────────────────────────────────────────
// Avoids hitting the DB on every request. Stale for up to 5s after key add/remove.
const KEY_CACHE_TTL_MS = 5_000;
let keyCache: { keys: { id: string; key: string }[]; fetchedAt: number } | null = null;
let keyCacheFetch: Promise<{ id: string; key: string }[]> | null = null;

async function loadCcKeys(): Promise<{ id: string; key: string }[]> {
  const now = Date.now();
  if (keyCache && now - keyCache.fetchedAt < KEY_CACHE_TTL_MS) return keyCache.keys;
  // Coalesce concurrent cache-miss fetches into a single DB query
  if (keyCacheFetch) return keyCacheFetch;
  keyCacheFetch = db
    .select({ id: ccKeysTable.id, key: ccKeysTable.key })
    .from(ccKeysTable)
    .where(and(eq(ccKeysTable.isActive, true), eq(ccKeysTable.isValid, true)))
    .then((keys) => {
      keyCache = { keys, fetchedAt: Date.now() };
      return keys;
    })
    .finally(() => { keyCacheFetch = null; });
  return keyCacheFetch;
}

/** Invalidate the key cache (call after add/remove/mark-invalid operations). */
export function invalidateCcKeyCache(): void {
  keyCache = null;
}

/**
 * Temporarily block a CC key for 60 s (after a 429 from upstream).
 * Uses the rate-limiter's blocked map — key never permanently invalidated.
 */
export function penalizeCcKey(id: string): void {
  penalizeRateLimit(`cc:${id}`, 0);
}

export async function getNextCcKey(): Promise<{ id: string; key: string } | null> {
  // Snapshot and increment BEFORE the async cache fetch — prevents concurrent
  // requests from all selecting the same key after awaiting the DB query.
  const idx = counter++;
  const keys = await loadCcKeys();
  if (keys.length === 0) return null;
  // Skip keys that are temporarily blocked (e.g. after a 429 from upstream).
  // Falls back to the round-robin key if every key is blocked.
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(idx + i) % keys.length]!;
    if (checkRateLimit(`cc:${key.id}`, 0)) return key;
  }
  return keys[idx % keys.length] ?? null;
}

export async function incrementCcKeyUsage(id: string): Promise<void> {
  await db
    .update(ccKeysTable)
    .set({
      usageCount: sql`${ccKeysTable.usageCount} + 1`,
      lastUsedAt: new Date(),
    })
    .where(eq(ccKeysTable.id, id));
}

export async function markCcKeyInvalid(id: string): Promise<void> {
  await db
    .update(ccKeysTable)
    .set({ isValid: false, lastCheckedAt: new Date() })
    .where(eq(ccKeysTable.id, id));
  invalidateCcKeyCache();
}

const CC_URL = "https://api.commandcode.ai/alpha/generate";
const CC_VERSION = "0.26.23";

export async function testCcKey(key: string): Promise<{ ok: boolean; message: string }> {
  const osName = process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "win32" : "linux";
  try {
    const res = await fetch(CC_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "x-command-code-version": CC_VERSION,
        "x-cli-environment": "production",
        "x-project-slug": "key-test",
        "x-session-id": randomUUID(),
        "x-oss-primary-provider": "deepseek",
        "User-Agent": "node-fetch",
      },
      body: JSON.stringify({
        config: {
          workingDir: "/test",
          date: new Date().toISOString().split("T")[0],
          environment: `${osName}-${os.arch()}, Node.js v20.0.0`,
          structure: [],
          isGitRepo: false,
          currentBranch: "main",
          mainBranch: "main",
          gitStatus: "",
          recentCommits: [],
        },
        memory: "",
        taste: null,
        skills: null,
        permissionMode: "auto-accept",
        params: {
          model: "deepseek/deepseek-v4-flash",
          messages: [{ role: "user", content: "Reply with just the word: OK" }],
          tools: [],
          system: "Reply with just the word: OK",
          max_tokens: 10,
          stream: false,
        },
      }),
    });

    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "Invalid or unauthorized API key" };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, message: `Error ${res.status}: ${text.slice(0, 120)}` };
    }
    return { ok: true, message: "Connection successful" };
  } catch (err) {
    return { ok: false, message: `Network error: ${String(err)}` };
  }
}

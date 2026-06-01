import { db, ccKeysTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import os from "os";

let counter = 0;

export async function getNextCcKey(): Promise<{ id: string; key: string } | null> {
  const keys = await db
    .select({ id: ccKeysTable.id, key: ccKeysTable.key })
    .from(ccKeysTable)
    .where(and(eq(ccKeysTable.isActive, true), eq(ccKeysTable.isValid, true)));

  if (keys.length === 0) return null;

  const key = keys[counter % keys.length];
  counter = (counter + 1) % Math.max(keys.length, 1);
  return key;
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

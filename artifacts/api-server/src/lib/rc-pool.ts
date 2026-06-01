import { db, rcKeysTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

let rcCounter = 0;

export async function getNextRcKey(): Promise<{ id: string; key: string } | null> {
  const keys = await db
    .select({ id: rcKeysTable.id, key: rcKeysTable.key })
    .from(rcKeysTable)
    .where(and(eq(rcKeysTable.isActive, true), eq(rcKeysTable.isValid, true)));

  if (keys.length === 0) return null;

  const key = keys[rcCounter % keys.length];
  rcCounter = (rcCounter + 1) % Math.max(keys.length, 1);
  return key;
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
}

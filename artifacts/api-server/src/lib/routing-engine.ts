import { db, routingRulesTable } from "@workspace/db";
import type { RoutingProviderEntry } from "@workspace/db";
import { eq } from "drizzle-orm";
import { checkRateLimit } from "./rate-limiter";

export type ResolvedRoute = {
  providerType: "cc" | "rc" | "ag" | "custom";
  providerId?: string;
  modelId: string;
  rateLimitKey: string;
  rpmLimit: number;
};

type RouteAttemptResult =
  | { ok: true; route: ResolvedRoute }
  | { ok: false; reason: "no_rules" | "all_rate_limited" | "inactive" };

/**
 * Resolve which provider + model to use for a given routing rule name.
 * Returns the first non-rate-limited provider in priority order.
 * Returns null if no matching active rule or all providers rate-limited.
 */
export async function resolveRoute(ruleName: string): Promise<RouteAttemptResult> {
  const rows = await db
    .select()
    .from(routingRulesTable)
    .where(eq(routingRulesTable.name, ruleName))
    .limit(1);

  const rule = rows[0];
  if (!rule || !rule.isActive) return { ok: false, reason: rule ? "inactive" : "no_rules" };

  const sorted = [...rule.providers].sort((a, b) => a.priority - b.priority);

  for (const entry of sorted) {
    const key = getRateLimitKey(entry);
    if (checkRateLimit(key, entry.rpmLimit)) {
      return {
        ok: true,
        route: {
          providerType: entry.providerType,
          providerId: entry.providerId,
          modelId: entry.modelId,
          rateLimitKey: key,
          rpmLimit: entry.rpmLimit,
        },
      };
    }
  }

  return { ok: false, reason: "all_rate_limited" };
}

/**
 * Called when a provider attempt fails (4xx/5xx/timeout).
 * Returns the next available provider to try as a fallback.
 */
export async function resolveNextRoute(
  ruleName: string,
  excludeKeys: string[],
): Promise<ResolvedRoute | null> {
  const rows = await db
    .select()
    .from(routingRulesTable)
    .where(eq(routingRulesTable.name, ruleName))
    .limit(1);

  const rule = rows[0];
  if (!rule || !rule.isActive) return null;

  const sorted = [...rule.providers].sort((a, b) => a.priority - b.priority);

  for (const entry of sorted) {
    const key = getRateLimitKey(entry);
    if (excludeKeys.includes(key)) continue;
    if (checkRateLimit(key, entry.rpmLimit)) {
      return {
        providerType: entry.providerType,
        providerId: entry.providerId,
        modelId: entry.modelId,
        rateLimitKey: key,
        rpmLimit: entry.rpmLimit,
      };
    }
  }
  return null;
}

function getRateLimitKey(entry: RoutingProviderEntry): string {
  switch (entry.providerType) {
    case "cc":     return "cc";
    case "rc":     return "rc:pool";
    case "ag":     return "ag:pool";
    case "custom": return `custom:${entry.providerId ?? "unknown"}`;
    default:       return entry.providerType;
  }
}

/**
 * Check whether a model string is a routing rule reference.
 * Routing model IDs are prefixed with "route:" e.g. "route:fast-model"
 */
export function isRoutingModel(modelId: string): boolean {
  return modelId.startsWith("route:");
}

export function extractRuleName(modelId: string): string {
  return modelId.slice("route:".length);
}

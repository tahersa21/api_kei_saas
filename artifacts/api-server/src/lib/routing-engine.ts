import { db, routingRulesTable } from "@workspace/db";
import type { RoutingProviderEntry } from "@workspace/db";
import { eq } from "drizzle-orm";
import { checkRateLimit, penalizeRateLimit } from "./rate-limiter";
export { penalizeRateLimit } from "./rate-limiter";

export type ResolvedRoute = {
  providerType: "cc" | "rc" | "ag" | "custom";
  providerId?: string;
  modelId: string;
  rateLimitKey: string;
  rpmLimit: number;
  /** Populated for custom providers when a specific key was stored in the routing entry */
  apiKey?: string;
  apiBaseUrl?: string;
};

type RouteAttemptResult =
  | { ok: true; route: ResolvedRoute }
  | { ok: false; reason: "no_rules" | "all_rate_limited" | "inactive" };

// ── Rule matching ────────────────────────────────────────────────────────────

type MatchedRule = Awaited<ReturnType<typeof db.select>>[number] & {
  providers: RoutingProviderEntry[];
  isActive: boolean;
  name: string;
};

/**
 * Find the best active routing rule for a given model name.
 *
 * Priority (highest → lowest):
 *  1. Exact match:   rule.name === modelName
 *  2. Contains:      modelName includes rule.name  (e.g. "codex" matches "gpt-5.3-codex")
 *  3. Default:       rule.name === "_default"
 */
async function findBestRule(modelName: string): Promise<MatchedRule | null> {
  const allActive = (await db
    .select()
    .from(routingRulesTable)
    .where(eq(routingRulesTable.isActive, true))) as MatchedRule[];

  // 1. Exact
  const exact = allActive.find(r => r.name === modelName);
  if (exact) return exact;

  // 2. Contains — longest match wins to avoid ambiguity
  const containing = allActive
    .filter(r => r.name !== "_default" && modelName.toLowerCase().includes(r.name.toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length);
  if (containing[0]) return containing[0];

  // 3. Default fallback
  const def = allActive.find(r => r.name === "_default");
  return def ?? null;
}

// ── resolveRoute ─────────────────────────────────────────────────────────────

/**
 * Resolve which provider + model to use for a given model/rule name.
 *
 * Matching priority: exact rule name → partial (model contains rule name) → _default rule.
 * Returns the first non-rate-limited provider in priority order.
 */
export async function resolveRoute(ruleName: string): Promise<RouteAttemptResult> {
  const rule = await findBestRule(ruleName);

  if (!rule) return { ok: false, reason: "no_rules" };

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
          apiKey: entry.apiKey,
          apiBaseUrl: entry.apiBaseUrl,
        },
      };
    }
  }

  return { ok: false, reason: "all_rate_limited" };
}

// ── resolveNextRoute ─────────────────────────────────────────────────────────

/**
 * Called when a provider attempt fails (4xx/5xx/timeout).
 * Returns the next available provider to try as a fallback.
 */
export async function resolveNextRoute(
  ruleName: string,
  excludeKeys: string[],
): Promise<ResolvedRoute | null> {
  const rule = await findBestRule(ruleName);
  if (!rule) return null;

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
        apiKey: entry.apiKey,
        apiBaseUrl: entry.apiBaseUrl,
      };
    }
  }
  return null;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function getRateLimitKey(entry: RoutingProviderEntry): string {
  const keySuffix = entry.apiKey ? `:${entry.apiKey.slice(-10)}` : "";
  switch (entry.providerType) {
    case "cc":     return `cc${keySuffix || ":pool"}`;
    case "rc":     return `rc${keySuffix || ":pool"}`;
    case "ag":     return `ag${keySuffix || ":pool"}`;
    case "custom": return `custom:${entry.providerId ?? "unknown"}${keySuffix}`;
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

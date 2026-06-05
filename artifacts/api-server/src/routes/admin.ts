import { Router } from "express";
import { randomBytes } from "crypto";
import { db, ccKeysTable, rcKeysTable, userKeysTable, requestLogsTable, providersTable, routingRulesTable } from "@workspace/db";
import type { RoutingProviderEntry } from "@workspace/db";
import { eq, and, desc, sql, count, gte } from "drizzle-orm";
import { signAdminToken, adminAuthMiddleware } from "../lib/admin-auth";
import { testCcKey, invalidateCcKeyCache } from "../lib/key-pool";
import { invalidateRcKeyCache } from "../lib/rc-pool";
import { getAllRpmStats } from "../lib/rate-limiter";

const router = Router();

// Brute-force protection: max 10 failed attempts per IP per 15 minutes
const loginFailures = new Map<string, { count: number; resetAt: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

function getClientIp(req: import("express").Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0]) ?? req.socket.remoteAddress ?? "unknown";
}

router.post("/admin/login", async (req, res) => {
  const ip = getClientIp(req);
  const now = Date.now();

  const entry = loginFailures.get(ip);
  if (entry && now < entry.resetAt && entry.count >= LOGIN_MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({ error: "Too many failed attempts. Try again later." });
    return;
  }

  const { password } = req.body as { password?: string };
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    res.status(500).json({ error: "ADMIN_PASSWORD environment variable is not set" });
    return;
  }
  if (!password || password !== adminPassword) {
    const current = loginFailures.get(ip);
    if (!current || now >= current.resetAt) {
      loginFailures.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    } else {
      current.count += 1;
    }
    res.status(401).json({ error: "Invalid password" });
    return;
  }

  loginFailures.delete(ip);
  res.json({ token: signAdminToken() });
});

router.use("/admin", adminAuthMiddleware);

// ── CC Keys ──────────────────────────────────────────────────────────────────

router.get("/admin/cc-keys", async (_req, res) => {
  const keys = await db.select().from(ccKeysTable).orderBy(desc(ccKeysTable.createdAt));
  res.json({ keys: keys.map(mask) });
});

router.post("/admin/cc-keys", async (req, res) => {
  const { label, key } = req.body as { label?: string; key?: string };
  if (!key?.trim()) {
    res.status(400).json({ error: "key is required" });
    return;
  }
  const id = randomBytes(12).toString("hex");
  const [created] = await db
    .insert(ccKeysTable)
    .values({ id, label: label?.trim() || "API Key", key: key.trim() })
    .returning();
  invalidateCcKeyCache();
  res.json({ key: mask(created) });
});

router.patch("/admin/cc-keys/:id", async (req, res) => {
  const { id } = req.params;
  const { label, isActive, isValid } = req.body as {
    label?: string;
    isActive?: boolean;
    isValid?: boolean;
  };
  const updates: Record<string, unknown> = {};
  if (label !== undefined) updates.label = label;
  if (isActive !== undefined) updates.isActive = isActive;
  if (isValid !== undefined) updates.isValid = isValid;
  await db.update(ccKeysTable).set(updates).where(eq(ccKeysTable.id, id));
  invalidateCcKeyCache();
  res.json({ ok: true });
});

router.delete("/admin/cc-keys/:id", async (req, res) => {
  await db.delete(ccKeysTable).where(eq(ccKeysTable.id, req.params.id));
  invalidateCcKeyCache();
  res.json({ ok: true });
});

router.post("/admin/cc-keys/:id/test", async (req, res) => {
  const rows = await db
    .select()
    .from(ccKeysTable)
    .where(eq(ccKeysTable.id, req.params.id))
    .limit(1);
  if (!rows[0]) {
    res.status(404).json({ error: "Key not found" });
    return;
  }
  const result = await testCcKey(rows[0].key);
  await db
    .update(ccKeysTable)
    .set({ isValid: result.ok, lastCheckedAt: new Date() })
    .where(eq(ccKeysTable.id, req.params.id));
  invalidateCcKeyCache();
  res.json(result);
});

// ── RC Keys ───────────────────────────────────────────────────────────────────

router.get("/admin/rc-keys", async (_req, res) => {
  const keys = await db.select().from(rcKeysTable).orderBy(desc(rcKeysTable.createdAt));
  res.json({ keys: keys.map(mask) });
});

router.post("/admin/rc-keys", async (req, res) => {
  const { label, key } = req.body as { label?: string; key?: string };
  if (!key?.trim()) {
    res.status(400).json({ error: "key is required" });
    return;
  }
  const id = randomBytes(12).toString("hex");
  const [created] = await db
    .insert(rcKeysTable)
    .values({ id, label: label?.trim() || "RC Key", key: key.trim() })
    .returning();
  invalidateRcKeyCache();
  res.json({ key: mask(created) });
});

router.patch("/admin/rc-keys/:id", async (req, res) => {
  const { id } = req.params;
  const { label, isActive, isValid } = req.body as {
    label?: string;
    isActive?: boolean;
    isValid?: boolean;
  };
  const updates: Record<string, unknown> = {};
  if (label !== undefined) updates.label = label;
  if (isActive !== undefined) updates.isActive = isActive;
  if (isValid !== undefined) updates.isValid = isValid;
  await db.update(rcKeysTable).set(updates).where(eq(rcKeysTable.id, id));
  invalidateRcKeyCache();
  res.json({ ok: true });
});

router.delete("/admin/rc-keys/:id", async (req, res) => {
  await db.delete(rcKeysTable).where(eq(rcKeysTable.id, req.params.id));
  invalidateRcKeyCache();
  res.json({ ok: true });
});

// ── Providers ─────────────────────────────────────────────────────────────────

router.get("/admin/providers", async (_req, res) => {
  const providers = await db.select().from(providersTable).orderBy(desc(providersTable.createdAt));
  res.json({ providers });
});

router.post("/admin/providers", async (req, res) => {
  const { name, slug, baseUrl, authMethod, additionalHeaders, channels, notes } = req.body as {
    name?: string;
    slug?: string;
    baseUrl?: string;
    authMethod?: string;
    additionalHeaders?: Record<string, string>;
    channels?: unknown[];
    notes?: string;
  };
  if (!name?.trim() || !slug?.trim() || !baseUrl?.trim()) {
    res.status(400).json({ error: "name, slug, and baseUrl are required" });
    return;
  }
  const id = randomBytes(12).toString("hex");
  const [created] = await db
    .insert(providersTable)
    .values({
      id,
      name: name.trim(),
      slug: slug.trim(),
      baseUrl: baseUrl.trim(),
      authMethod: authMethod ?? "bearer",
      additionalHeaders: additionalHeaders ?? {},
      channels: (channels ?? []) as import("@workspace/db").ProviderChannel[],
      notes: notes?.trim() || null,
    })
    .returning();
  res.json({ provider: created });
});

router.patch("/admin/providers/:id", async (req, res) => {
  const { id } = req.params;
  const { name, slug, baseUrl, authMethod, additionalHeaders, channels, notes, isActive } = req.body as {
    name?: string;
    slug?: string;
    baseUrl?: string;
    authMethod?: string;
    additionalHeaders?: Record<string, string>;
    channels?: unknown[];
    notes?: string;
    isActive?: boolean;
  };
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (slug !== undefined) updates.slug = slug;
  if (baseUrl !== undefined) updates.baseUrl = baseUrl;
  if (authMethod !== undefined) updates.authMethod = authMethod;
  if (additionalHeaders !== undefined) updates.additionalHeaders = additionalHeaders;
  if (channels !== undefined) updates.channels = channels;
  if (notes !== undefined) updates.notes = notes;
  if (isActive !== undefined) updates.isActive = isActive;
  await db.update(providersTable).set(updates).where(eq(providersTable.id, id));
  res.json({ ok: true });
});

router.delete("/admin/providers/:id", async (req, res) => {
  await db.delete(providersTable).where(eq(providersTable.id, req.params.id));
  res.json({ ok: true });
});

// ── User Keys ─────────────────────────────────────────────────────────────────

router.get("/admin/user-keys", async (_req, res) => {
  const keys = await db.select().from(userKeysTable).orderBy(desc(userKeysTable.createdAt));
  res.json({ keys: keys.map(mask) });
});

router.post("/admin/user-keys", async (req, res) => {
  const { label } = req.body as { label?: string };
  const id = randomBytes(12).toString("hex");
  const key = `sk-cc-${randomBytes(24).toString("hex")}`;
  const [created] = await db
    .insert(userKeysTable)
    .values({ id, label: label?.trim() || "New Key", key })
    .returning();
  res.json({ key: created });
});

router.patch("/admin/user-keys/:id", async (req, res) => {
  const { label, isActive } = req.body as { label?: string; isActive?: boolean };
  const updates: Record<string, unknown> = {};
  if (label !== undefined) updates.label = label;
  if (isActive !== undefined) updates.isActive = isActive;
  await db.update(userKeysTable).set(updates).where(eq(userKeysTable.id, req.params.id));
  res.json({ ok: true });
});

router.delete("/admin/user-keys/:id", async (req, res) => {
  await db.delete(userKeysTable).where(eq(userKeysTable.id, req.params.id));
  res.json({ ok: true });
});

// ── Stats ─────────────────────────────────────────────────────────────────────

router.get("/admin/stats", async (_req, res) => {
  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const last7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const last14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  const [
    [totalCcKeys], [activeCcKeys],
    [totalRcKeys], [activeRcKeys],
    [totalUserKeys], [activeUserKeys],
    [totalRequests], [todayRequests], [week7Requests], [yesterdayRequests],
    [successCount], [avgResp],
    topModels, topUserKeys,
    rawTimeSeries,
  ] = await Promise.all([
    db.select({ c: count() }).from(ccKeysTable),
    db.select({ c: count() }).from(ccKeysTable).where(and(eq(ccKeysTable.isActive, true), eq(ccKeysTable.isValid, true))),
    db.select({ c: count() }).from(rcKeysTable),
    db.select({ c: count() }).from(rcKeysTable).where(and(eq(rcKeysTable.isActive, true), eq(rcKeysTable.isValid, true))),
    db.select({ c: count() }).from(userKeysTable),
    db.select({ c: count() }).from(userKeysTable).where(eq(userKeysTable.isActive, true)),
    db.select({ c: count() }).from(requestLogsTable),
    db.select({ c: count() }).from(requestLogsTable).where(gte(requestLogsTable.createdAt, today)),
    db.select({ c: count() }).from(requestLogsTable).where(gte(requestLogsTable.createdAt, last7)),
    db.select({ c: count() }).from(requestLogsTable).where(and(gte(requestLogsTable.createdAt, yesterday), sql`${requestLogsTable.createdAt} < ${today}`)),
    db.select({ c: count() }).from(requestLogsTable).where(eq(requestLogsTable.status, "ok")),
    db.select({ avg: sql<number>`avg(${requestLogsTable.elapsedMs})` }).from(requestLogsTable).where(and(eq(requestLogsTable.status, "ok"), sql`${requestLogsTable.elapsedMs} is not null`)),
    db.select({ model: requestLogsTable.model, c: count() }).from(requestLogsTable).groupBy(requestLogsTable.model).orderBy(desc(count())).limit(8),
    db.select({ label: userKeysTable.label, c: count() }).from(requestLogsTable).leftJoin(userKeysTable, eq(requestLogsTable.userKeyId, userKeysTable.id)).where(sql`${requestLogsTable.userKeyId} is not null`).groupBy(userKeysTable.label).orderBy(desc(count())).limit(5),
    db.select({
      day: sql<string>`date_trunc('day', ${requestLogsTable.createdAt})::date::text`,
      total: count(),
      errors: sql<number>`sum(case when ${requestLogsTable.status} = 'error' then 1 else 0 end)`,
      avgMs: sql<number>`avg(${requestLogsTable.elapsedMs})`,
    }).from(requestLogsTable).where(gte(requestLogsTable.createdAt, last14)).groupBy(sql`date_trunc('day', ${requestLogsTable.createdAt})`).orderBy(sql`date_trunc('day', ${requestLogsTable.createdAt})`),
  ]);

  // Fill in missing days in the 14-day time series
  const seriesMap = new Map(rawTimeSeries.map((r) => [r.day, r]));
  const timeSeries: { date: string; requests: number; errors: number; avgMs: number | null }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().split("T")[0];
    const row = seriesMap.get(key);
    timeSeries.push({
      date: key,
      requests: row ? Number(row.total) : 0,
      errors: row ? Number(row.errors) : 0,
      avgMs: row ? (row.avgMs ? Math.round(Number(row.avgMs)) : null) : null,
    });
  }

  const total = Number(totalRequests.c);
  const ok = Number(successCount.c);

  res.json({
    ccKeys: { total: Number(totalCcKeys.c), active: Number(activeCcKeys.c) },
    rcKeys: { total: Number(totalRcKeys.c), active: Number(activeRcKeys.c) },
    userKeys: { total: Number(totalUserKeys.c), active: Number(activeUserKeys.c) },
    requests: {
      total,
      today: Number(todayRequests.c),
      yesterday: Number(yesterdayRequests.c),
      week: Number(week7Requests.c),
    },
    successRate: total > 0 ? Math.round((ok / total) * 100) : 100,
    avgResponseMs: avgResp.avg ? Math.round(Number(avgResp.avg)) : null,
    topModels: topModels.map((r) => ({ model: r.model, count: Number(r.c) })),
    topUserKeys: topUserKeys.map((r) => ({ label: r.label ?? "—", count: Number(r.c) })),
    timeSeries,
  });
});

// ── Logs ──────────────────────────────────────────────────────────────────────

router.get("/admin/logs", async (req, res) => {
  const limit = Math.min(Number(req.query["limit"] ?? 50), 100);
  const offset = Number(req.query["offset"] ?? 0);

  const [logs, [{ c: total }]] = await Promise.all([
    db
      .select({
        id: requestLogsTable.id,
        model: requestLogsTable.model,
        elapsedMs: requestLogsTable.elapsedMs,
        status: requestLogsTable.status,
        errorMsg: requestLogsTable.errorMsg,
        createdAt: requestLogsTable.createdAt,
        userKeyLabel: userKeysTable.label,
        ccKeyLabel: ccKeysTable.label,
      })
      .from(requestLogsTable)
      .leftJoin(userKeysTable, eq(requestLogsTable.userKeyId, userKeysTable.id))
      .leftJoin(ccKeysTable, eq(requestLogsTable.ccKeyId, ccKeysTable.id))
      .orderBy(desc(requestLogsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ c: count() }).from(requestLogsTable),
  ]);

  res.json({ logs, total: Number(total) });
});

// ── Provider Models Proxy ──────────────────────────────────────────────────────
// Fetches /v1/models from an arbitrary base URL server-side to avoid CORS issues.
// Accepts optional apiKey; if omitted tries without auth (public endpoints).

// Candidate paths to try when auto-discovering a provider's models endpoint.
// Ordered by likelihood of success across common OpenAI-compatible APIs.
const MODEL_ENDPOINT_CANDIDATES = [
  "/v1/models",        // OpenAI standard, most providers
  "/models/public",    // right.codes, some public APIs
  "/models",           // lightweight wrappers
  "/api/v1/models",    // some self-hosted setups
  "/api/models",       // alternate style
  "/v1/models/list",   // rare but seen in some providers
  "/v1beta/models",    // Gemini-compatible APIs (AiGoCode, code.newcli.com, right.codes/gemini)
];

// Paths tried on parent URL segments (for sub-channel providers like right.codes/codex → right.codes)
const MODEL_PARENT_CANDIDATES = ["/models/public", "/v1/models", "/models"];

type ModelEntry = { id: string; owned_by?: string };

/** Parse a models list response — handles OpenAI, raw array, and Gemini native formats. */
function parseModelsResponse(parsed: unknown): ModelEntry[] | null {
  if (Array.isArray(parsed)) return parsed as ModelEntry[];

  const obj = parsed as Record<string, unknown>;

  // OpenAI format: { data: [{id, ...}] }
  if (Array.isArray(obj.data)) return obj.data as ModelEntry[];

  // Gemini native format: { models: [{name: "models/gemini-3.1-pro", displayName: "..."}] }
  if (Array.isArray(obj.models)) {
    return (obj.models as { name?: string; displayName?: string }[]).map(m => ({
      id: (m.name ?? "").replace(/^models\//, ""),
      owned_by: "google",
    })).filter(m => m.id.length > 0);
  }

  return null;
}

async function tryFetchModels(
  base: string,
  path: string,
  headers: Record<string, string>,
  queryParams?: string,
): Promise<ModelEntry[] | null> {
  try {
    const url = queryParams ? `${base}${path}?${queryParams}` : `${base}${path}`;
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(8_000) });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") ?? "";
    const text = await r.text();
    if (ct.includes("text/html") || text.trimStart().startsWith("<")) return null;
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return null; }
    return parseModelsResponse(parsed);
  } catch {
    return null;
  }
}

/** Returns parent base URLs by stripping path segments one at a time.
 *  e.g. "https://right.codes/codex/v1" → ["https://right.codes/codex", "https://right.codes"] */
function getParentBases(baseUrl: string): string[] {
  try {
    const url = new URL(baseUrl);
    const segments = url.pathname.replace(/\/$/, "").split("/").filter(Boolean);
    const parents: string[] = [];
    while (segments.length > 0) {
      segments.pop();
      const path = segments.length > 0 ? `/${segments.join("/")}` : "";
      parents.push(`${url.protocol}//${url.host}${path}`);
    }
    return parents;
  } catch {
    return [];
  }
}

router.post("/admin/provider-models", async (req, res) => {
  const { baseUrl, apiKey, apiType } = req.body as {
    baseUrl?: string;
    apiKey?: string;
    apiType?: string;
  };
  if (!baseUrl) {
    res.status(400).json({ error: "baseUrl is required" });
    return;
  }
  const base = baseUrl.replace(/\/$/, "");
  const bearerHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) bearerHeaders["Authorization"] = `Bearer ${apiKey}`;

  // For Gemini-type keys we also pass ?key= as a query param (Google-compatible providers)
  const geminiKeyParam = apiKey ? `key=${encodeURIComponent(apiKey)}` : undefined;

  // Helper that tries both auth methods for a given path (bearer + ?key= when relevant)
  const tryPath = async (b: string, path: string): Promise<ModelEntry[] | null> => {
    // First: standard bearer header
    const result = await tryFetchModels(b, path, bearerHeaders);
    if (result !== null) return result;
    // Second: Gemini ?key= param (only for /v1beta/models or explicit gemini type)
    if (geminiKeyParam && (path === "/v1beta/models" || apiType === "gemini")) {
      return tryFetchModels(b, path, { "Content-Type": "application/json" }, geminiKeyParam);
    }
    return null;
  };

  // When apiType is gemini, prioritise /v1beta/models first before the full candidate list
  const candidates =
    apiType === "gemini"
      ? ["/v1beta/models", ...MODEL_ENDPOINT_CANDIDATES.filter(p => p !== "/v1beta/models")]
      : MODEL_ENDPOINT_CANDIDATES;

  // 1. Try all candidates at the given base URL
  for (const path of candidates) {
    const list = await tryPath(base, path);
    if (list !== null) {
      res.json({ models: list, detectedPath: path });
      return;
    }
  }

  // 2. Fallback: try parent URL segments (handles sub-channel providers, e.g. right.codes/codex → right.codes)
  const parents = getParentBases(base);
  for (const parentBase of parents) {
    for (const path of MODEL_PARENT_CANDIDATES) {
      const list = await tryPath(parentBase, path);
      if (list !== null) {
        res.json({ models: list, detectedPath: `[${parentBase}]${path}` });
        return;
      }
    }
  }

  // Nothing worked — give a helpful message
  res.status(502).json({
    error: `لم يتم العثور على نقطة نهاية للنماذج في ${base}. جُرِّبت المسارات التالية تلقائياً: ${candidates.join(", ")}. تأكد من أن الرابط صحيح وأن المزود يدعم OpenAI-compatible API.`,
  });
});

// ── Routing Rules ──────────────────────────────────────────────────────────────

router.get("/admin/routing-rules", async (_req, res) => {
  const rules = await db.select().from(routingRulesTable).orderBy(routingRulesTable.createdAt);
  const rpmStats = getAllRpmStats();
  res.json({ rules, rpmStats });
});

router.post("/admin/routing-rules", async (req, res) => {
  const { name, description, providers, isActive } = req.body as {
    name?: string;
    description?: string;
    providers?: RoutingProviderEntry[];
    isActive?: boolean;
  };
  if (!name?.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const id = randomBytes(12).toString("hex");
  const [created] = await db
    .insert(routingRulesTable)
    .values({
      id,
      name: name.trim(),
      description: description?.trim() ?? null,
      providers: (providers ?? []).map((p, i) => ({ ...p, priority: p.priority ?? i })),
      isActive: isActive ?? true,
    })
    .returning();
  res.json({ rule: created });
});

router.patch("/admin/routing-rules/:id", async (req, res) => {
  const { name, description, providers, isActive } = req.body as {
    name?: string;
    description?: string;
    providers?: RoutingProviderEntry[];
    isActive?: boolean;
  };
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name.trim();
  if (description !== undefined) updates.description = description.trim() || null;
  if (providers !== undefined) updates.providers = providers;
  if (isActive !== undefined) updates.isActive = isActive;
  await db.update(routingRulesTable).set(updates).where(eq(routingRulesTable.id, req.params.id));
  res.json({ ok: true });
});

router.delete("/admin/routing-rules/:id", async (req, res) => {
  await db.delete(routingRulesTable).where(eq(routingRulesTable.id, req.params.id));
  res.json({ ok: true });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function mask<T extends { key: string }>(row: T): T {
  const k = row.key;
  const masked = k.length <= 10 ? "••••••••" : k.slice(0, 7) + "•".repeat(Math.min(k.length - 10, 24)) + k.slice(-3);
  return { ...row, key: masked };
}

export default router;

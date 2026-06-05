import { Router } from "express";
import { randomBytes } from "crypto";
import { db, userKeysTable, requestLogsTable, providersTable, routingRulesTable } from "@workspace/db";
import type { RoutingProviderEntry } from "@workspace/db";
import { eq, and, desc, sql, count, gte, inArray } from "drizzle-orm";
import { signAdminToken, adminAuthMiddleware } from "../lib/admin-auth";
import { getAllRpmStats } from "../lib/rate-limiter";
import { getSettings, updateSettings, setModelOverride, getUserCredit, adjustUserCredit, getUserTransactions } from "../lib/settings";
import { getUserRpmUsage } from "../lib/user-rate-limiter";

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
  const { label, isActive, rpmLimit } = req.body as { label?: string; isActive?: boolean; rpmLimit?: number };
  const updates: Record<string, unknown> = {};
  if (label !== undefined) updates.label = label;
  if (isActive !== undefined) updates.isActive = isActive;
  if (rpmLimit !== undefined) updates.rpmLimit = Math.max(1, Math.min(10000, Number(rpmLimit)));
  await db.update(userKeysTable).set(updates).where(eq(userKeysTable.id, req.params.id));
  res.json({ ok: true });
});

router.delete("/admin/user-keys/:id", async (req, res) => {
  await db.delete(userKeysTable).where(eq(userKeysTable.id, req.params.id));
  res.json({ ok: true });
});

// ── Users (Clerk) ─────────────────────────────────────────────────────────────

router.get("/admin/users", async (_req, res) => {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) { res.status(500).json({ error: "CLERK_SECRET_KEY not set" }); return; }

  try {
    const r = await fetch("https://api.clerk.com/v1/users?limit=100&order_by=-created_at", {
      headers: { Authorization: `Bearer ${secretKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) { res.status(502).json({ error: "Clerk API error" }); return; }
    const data = await r.json() as { id: string; email_addresses: { email_address: string }[]; first_name: string | null; last_name: string | null; image_url: string; created_at: number; last_sign_in_at: number | null }[];

    const clerkIds = data.map(u => u.id);
    const userKeys = clerkIds.length > 0
      ? await db.select({
          clerkUserId: userKeysTable.clerkUserId,
          usageCount: userKeysTable.usageCount,
          isActive: userKeysTable.isActive,
          id: userKeysTable.id,
          rpmLimit: userKeysTable.rpmLimit,
        }).from(userKeysTable).where(inArray(userKeysTable.clerkUserId, clerkIds))
      : [];

    const keysByUser = new Map<string, typeof userKeys>();
    for (const k of userKeys) {
      if (!k.clerkUserId) continue;
      if (!keysByUser.has(k.clerkUserId)) keysByUser.set(k.clerkUserId, []);
      keysByUser.get(k.clerkUserId)!.push(k);
    }

    const users = data.map(u => ({
      id: u.id,
      email: u.email_addresses[0]?.email_address ?? "",
      name: [u.first_name, u.last_name].filter(Boolean).join(" ") || null,
      imageUrl: u.image_url,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at,
      keys: keysByUser.get(u.id) ?? [],
      totalUsage: (keysByUser.get(u.id) ?? []).reduce((s, k) => s + k.usageCount, 0),
      creditBalance: getUserCredit(u.id),
    }));

    res.json({ users });
  } catch {
    res.status(502).json({ error: "Failed to fetch users" });
  }
});

// ── Credit Management ─────────────────────────────────────────────────────────

router.post("/admin/users/:clerkId/credits", (req, res) => {
  const { clerkId } = req.params;
  const { delta, note } = req.body as { delta?: number; note?: string };
  if (typeof delta !== "number" || !Number.isFinite(delta)) {
    res.status(400).json({ error: "delta must be a finite number" });
    return;
  }
  const settings = adjustUserCredit(clerkId, Math.round(delta), note ?? (delta >= 0 ? "Admin grant" : "Admin deduction"));
  res.json({ balance: settings.userCredits[clerkId] ?? 0 });
});

router.get("/admin/users/:clerkId/credits", (req, res) => {
  const { clerkId } = req.params;
  res.json({ balance: getUserCredit(clerkId), transactions: getUserTransactions(clerkId) });
});

// Per-user usage breakdown from request logs
router.get("/admin/users/:clerkId/usage", async (req, res) => {
  const { clerkId } = req.params;
  const keys = await db.select({ id: userKeysTable.id }).from(userKeysTable).where(eq(userKeysTable.clerkUserId, clerkId));
  if (keys.length === 0) { res.json({ total: 0, today: 0, week: 0, models: [], daily: [] }); return; }

  const keyIds = keys.map(k => k.id);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const last14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const [[totalRow], [todayRow], [weekRow], modelRows, dailyRows] = await Promise.all([
    db.select({ c: count() }).from(requestLogsTable).where(inArray(requestLogsTable.userKeyId, keyIds)),
    db.select({ c: count() }).from(requestLogsTable).where(and(inArray(requestLogsTable.userKeyId, keyIds), gte(requestLogsTable.createdAt, todayStart))),
    db.select({ c: count() }).from(requestLogsTable).where(and(inArray(requestLogsTable.userKeyId, keyIds), gte(requestLogsTable.createdAt, weekAgo))),
    db.select({ model: requestLogsTable.model, c: count() })
      .from(requestLogsTable).where(inArray(requestLogsTable.userKeyId, keyIds))
      .groupBy(requestLogsTable.model).orderBy(desc(count())).limit(10),
    db.select({
      day: sql<string>`date_trunc('day', ${requestLogsTable.createdAt})::date::text`,
      total: count(),
      errors: sql<number>`sum(case when ${requestLogsTable.status} = 'error' then 1 else 0 end)`,
    }).from(requestLogsTable)
      .where(and(inArray(requestLogsTable.userKeyId, keyIds), gte(requestLogsTable.createdAt, last14)))
      .groupBy(sql`date_trunc('day', ${requestLogsTable.createdAt})`)
      .orderBy(sql`date_trunc('day', ${requestLogsTable.createdAt})`),
  ]);

  const seriesMap = new Map(dailyRows.map((r: { day: string; total: number; errors: number }) => [r.day, r] as const));
  const daily: { date: string; requests: number; errors: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const k = d.toISOString().split("T")[0]!;
    const row = seriesMap.get(k) as { day: string; total: number; errors: number } | undefined;
    daily.push({ date: k, requests: row ? Number(row.total) : 0, errors: row ? Number(row.errors) : 0 });
  }

  res.json({
    total: Number(totalRow?.c ?? 0),
    today: Number(todayRow?.c ?? 0),
    week: Number(weekRow?.c ?? 0),
    models: modelRows.map(r => ({ model: r.model, count: Number(r.c) })),
    daily,
  });
});

// ── Settings ──────────────────────────────────────────────────────────────────

router.get("/admin/settings", (_req, res) => {
  res.json(getSettings());
});

router.patch("/admin/settings", (req, res) => {
  const { defaultRpmLimit, maxKeysPerUser, registrationsEnabled, siteName, maintenanceMode } =
    req.body as { defaultRpmLimit?: number; maxKeysPerUser?: number; registrationsEnabled?: boolean; siteName?: string; maintenanceMode?: boolean };
  const patch: Parameters<typeof updateSettings>[0] = {};
  if (defaultRpmLimit !== undefined) patch.defaultRpmLimit = Math.max(1, Math.min(10000, Number(defaultRpmLimit)));
  if (maxKeysPerUser !== undefined) patch.maxKeysPerUser = Math.max(1, Math.min(50, Number(maxKeysPerUser)));
  if (registrationsEnabled !== undefined) patch.registrationsEnabled = Boolean(registrationsEnabled);
  if (siteName !== undefined) patch.siteName = String(siteName).slice(0, 64);
  if (maintenanceMode !== undefined) patch.maintenanceMode = Boolean(maintenanceMode);
  const updated = updateSettings(patch);
  res.json(updated);
});

// ── User RPM stats ─────────────────────────────────────────────────────────────
router.get("/admin/user-rpm", async (_req, res) => {
  const keys = await db.select({ id: userKeysTable.id, label: userKeysTable.label, rpmLimit: userKeysTable.rpmLimit, clerkUserId: userKeysTable.clerkUserId }).from(userKeysTable).where(eq(userKeysTable.isActive, true));
  const stats = keys.map(k => ({ id: k.id, label: k.label, rpmLimit: k.rpmLimit, currentRpm: getUserRpmUsage(k.id), clerkUserId: k.clerkUserId }));
  res.json({ stats });
});

// ── Stats ─────────────────────────────────────────────────────────────────────

router.get("/admin/stats", async (_req, res) => {
  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const last7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const last14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  const [
    [totalUserKeys], [activeUserKeys],
    [totalRequests], [todayRequests], [week7Requests], [yesterdayRequests],
    [successCount], [avgResp],
    topModels, topUserKeys,
    rawTimeSeries,
  ] = await Promise.all([
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
  type TsRow = { day: string; total: number; errors: number; avgMs: number };
  const seriesMap = new Map(rawTimeSeries.map((r: TsRow) => [r.day, r] as const));
  const timeSeries: { date: string; requests: number; errors: number; avgMs: number | null }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().split("T")[0];
    const row = seriesMap.get(key) as TsRow | undefined;
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
      })
      .from(requestLogsTable)
      .leftJoin(userKeysTable, eq(requestLogsTable.userKeyId, userKeysTable.id))
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

// ── Model Overrides ───────────────────────────────────────────────────────────

// GET /admin/model-overrides — return current overrides map + settings
router.get("/admin/model-overrides", (_req, res) => {
  const { modelOverrides } = getSettings();
  res.json({ overrides: modelOverrides });
});

// PATCH /admin/model-overrides/:modelId — set/merge an override
router.patch("/admin/model-overrides/:modelId", (req, res) => {
  const modelId = decodeURIComponent(req.params.modelId);
  const { hidden, displayName, price } = req.body as {
    hidden?: boolean;
    displayName?: string;
    price?: { input: number; output: number } | null;
  };
  const patch: import("../lib/settings.js").ModelOverride = {};
  if (hidden !== undefined) patch.hidden = hidden;
  if (displayName !== undefined) patch.displayName = displayName || undefined;
  if (price !== undefined) patch.price = price ?? undefined;
  const updated = setModelOverride(modelId, patch);
  res.json({ overrides: updated.modelOverrides });
});

// DELETE /admin/model-overrides/:modelId — clear override entirely
router.delete("/admin/model-overrides/:modelId", (req, res) => {
  const modelId = decodeURIComponent(req.params.modelId);
  const updated = setModelOverride(modelId, null);
  res.json({ overrides: updated.modelOverrides });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function mask<T extends { key: string }>(row: T): T {
  const k = row.key;
  const masked = k.length <= 10 ? "••••••••" : k.slice(0, 7) + "•".repeat(Math.min(k.length - 10, 24)) + k.slice(-3);
  return { ...row, key: masked };
}

export default router;

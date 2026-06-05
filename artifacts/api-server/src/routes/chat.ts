import { Router } from "express";
import { randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { db, userKeysTable, requestLogsTable, providersTable, routingRulesTable } from "@workspace/db";
import type { RoutingProviderEntry } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { isRoutingModel, extractRuleName, resolveRoute, resolveNextRoute, penalizeRateLimit } from "../lib/routing-engine";

const router = Router();

// ── AiGoCode (aigocode.com) ────────────────────────────────────────────────
const AG_BASE = "https://www.aigocode.com";

type AgApiType = "openai" | "anthropic" | "gemini";

function getAgApiType(modelId: string): AgApiType {
  const m = modelId.replace(/^ag:/, "");
  if (m.startsWith("claude-")) return "anthropic";
  if (m.startsWith("gemini-")) return "gemini";
  return "openai";
}

const CACHE_TTL_MS = 10 * 60 * 1000;

type ModelDef = { id: string; name: string; group: string; description: string; tier: string; provider?: string };

// ── Custom provider upstream builder ─────────────────────────────────────────
type CustomApiType = "openai" | "codex" | "anthropic";

function buildCustomUpstream(
  base: string,
  type: CustomApiType,
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  system: string,
): { url: string; headers: Record<string, string>; body: unknown } {
  if (type === "anthropic") {
    return {
      url: `${base}/v1/messages`,
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: { model, messages, system, max_tokens: 16000, stream: true },
    };
  }
  if (type === "codex") {
    return {
      url: `${base}/v1/responses`,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: { model, input: messages.map(m => ({ role: m.role, content: m.content })), stream: true },
    };
  }
  // openai (default)
  const allMsgs = system
    ? [{ role: "system", content: system }, ...messages]
    : messages;
  return {
    url: `${base}/v1/chat/completions`,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: { model, messages: allMsgs, stream: true },
  };
}

function parseCustomChunk(type: CustomApiType, jsonStr: string, lastEvent: string): string | null {
  try {
    const chunk = JSON.parse(jsonStr) as Record<string, unknown>;
    if (type === "anthropic") {
      if (lastEvent === "content_block_delta") {
        const delta = chunk.delta as { type?: string; text?: string } | undefined;
        if (delta?.type === "text_delta" && delta.text) return delta.text;
      }
    } else if (type === "codex") {
      const delta = chunk as { type?: string; delta?: { text?: string } };
      if (delta.type === "response.output_text.delta" && delta.delta?.text) return delta.delta.text;
    } else {
      const choices = chunk.choices as Array<{ delta?: { content?: string } }> | undefined;
      const content = choices?.[0]?.delta?.content;
      if (content) return content;
    }
  } catch { /* skip */ }
  return null;
}

// ── AG models cache (per-key, 10 min TTL, max 200 entries) ───────────────────
// Bounded to prevent unbounded growth when many different API keys are used.
const AG_CACHE_MAX = 200;
const agModelsCache = new Map<string, { models: ModelDef[]; fetchedAt: number }>();
const agModelsFetchMap = new Map<string, Promise<ModelDef[]>>(); // coalesces concurrent cache misses

async function fetchAgModels(apiKey: string): Promise<ModelDef[]> {
  const cached = agModelsCache.get(apiKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.models;
  const inflight = agModelsFetchMap.get(apiKey);
  if (inflight) return inflight;

  const p = doFetchAgModels(apiKey).finally(() => { agModelsFetchMap.delete(apiKey); });
  agModelsFetchMap.set(apiKey, p);
  return p;
}

async function doFetchAgModels(apiKey: string): Promise<ModelDef[]> {
  try {
    const res = await fetch(`${AG_BASE}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { data?: Array<{ id: string; owned_by?: string }> };
    const rawModels = data.data ?? [];

    const models: ModelDef[] = rawModels.map((m) => {
      const apiType = getAgApiType(`ag:${m.id}`);
      const group =
        apiType === "anthropic" ? "Claude" :
        apiType === "gemini"    ? "Gemini" :
        m.id.startsWith("gpt-") ? "GPT" :
        m.id.startsWith("deepseek-") ? "DeepSeek" :
        "Other";
      return {
        id: `ag:${m.id}`,
        name: m.id,
        group,
        description: `${m.id} via AiGoCode`,
        tier: "free" as const,
        provider: "aigocode",
      };
    });

    // Evict oldest entry when cache is at capacity
    if (agModelsCache.size >= AG_CACHE_MAX) {
      const oldest = agModelsCache.keys().next().value;
      if (oldest) agModelsCache.delete(oldest);
    }
    agModelsCache.set(apiKey, { models, fetchedAt: Date.now() });
    return models;
  } catch {
    return agModelsCache.get(apiKey)?.models ?? [];
  }
}

// ── GET /chat/models — returns active routing rules as models ────────────────
router.get("/chat/models", async (_req, res) => {
  const rules = await db.select().from(routingRulesTable).where(eq(routingRulesTable.isActive, true));
  const models = rules.map(r => ({ id: `route:${r.name}`, name: r.name, description: r.description }));
  res.json({ models });
});

// ── GET /chat/rc-pool-status — always returns 0 (RC pool removed) ─────────────
router.get("/chat/rc-pool-status", (_req, res) => res.json({ active: 0 }));

// ── GET /chat/rc-models — returns empty (RC removed, use routing rules) ────────
router.get("/chat/rc-models", (_req, res) => res.json({ models: [] }));

// ── GET /chat/models-catalog — returns active routing rules as model catalog ──
// All traffic is now routed through Smart Routing rules configured in admin panel.
router.get("/chat/models-catalog", async (_req, res) => {
  const rules = await db.select().from(routingRulesTable).where(eq(routingRulesTable.isActive, true));
  const routing = rules.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    providers: (r.providers as RoutingProviderEntry[]).map(p => ({
      type: p.providerType,
      modelId: p.modelId,
    })),
  }));
  res.json({ cc: [], rc: [], routing });
});

// ── GET /chat/ag-models — AiGoCode models (per-key, cached 10 min) ───────────
router.get("/chat/ag-models", async (req, res) => {
  const agKey = req.headers["x-aigocode-key"] as string | undefined;
  if (!agKey) {
    res.status(400).json({ error: "AiGoCode API key required (X-Aigocode-Key header)" });
    return;
  }
  try {
    const models = await fetchAgModels(agKey);
    res.json({ models });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch AiGoCode models");
    res.status(500).json({ error: "Failed to fetch AiGoCode models" });
  }
});

// ── PROXY: Anthropic-compatible — for Claude Code ─────────────────────────────
// Set: ANTHROPIC_API_KEY=<your-cc-key> ANTHROPIC_BASE_URL=<host>/api/proxy/claude
// Claude Code will POST to /api/proxy/claude/v1/messages automatically.

router.get("/proxy/claude/v1/models", (_req, res) => {
  res.json({
    object: "list",
    data: [
      { id: "claude-opus-4-5",   object: "model", created: 1700000000, owned_by: "anthropic" },
      { id: "claude-sonnet-4-5", object: "model", created: 1700000000, owned_by: "anthropic" },
      { id: "claude-haiku-3-5",  object: "model", created: 1700000000, owned_by: "anthropic" },
    ],
  });
});

router.post("/proxy/claude/v1/messages", async (req, res) => {
  const xApiKey = req.headers["x-api-key"] as string | undefined;
  const authHeader = (req.headers["authorization"] as string | undefined)?.replace(/^bearer\s+/i, "");
  const incomingKey = xApiKey || authHeader;
  let userKeyId: string | undefined;
  if (incomingKey?.startsWith("sk-cc-")) {
    const rows = await db.select().from(userKeysTable).where(eq(userKeysTable.key, incomingKey)).limit(1);
    if (!rows[0] || !rows[0].isActive) { res.status(401).json({ type: "error", error: { type: "authentication_error", message: "Invalid or inactive API key" } }); return; }
    userKeyId = rows[0].id;
  }
  const requestedModel = (req.body as { model?: string }).model || "claude";
  const ruleName = isRoutingModel(requestedModel) ? extractRuleName(requestedModel) : requestedModel;
  const result = await resolveRoute(ruleName);
  if (!result.ok) {
    const msg = result.reason === "all_rate_limited" ? `All providers for "${ruleName}" are rate-limited.` : `No routing rule for "\". Create one in Smart Routing.`;
    res.status(result.reason === "all_rate_limited" ? 429 : 404).json({ type: "error", error: { type: "api_error", message: msg } }); return;
  }
  const { apiKey: rKey, apiBaseUrl: rUrl } = result.route;
  if (!rKey || !rUrl) { res.status(400).json({ type: "error", error: { type: "api_error", message: "No API key/URL in routing rule." } }); return; }
  try {
    const fwdH: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (["host","connection","transfer-encoding","content-length","x-api-key","authorization"].includes(k)) continue;
      if (typeof v === "string") fwdH[k] = v; else if (Array.isArray(v)) fwdH[k] = v.join(", ");
    }
    fwdH["x-api-key"] = rKey;
    if (!fwdH["content-type"]) fwdH["content-type"] = "application/json";
    const base = rUrl.replace(/\/$/, "");
    const upstream = await fetch(`${base}/v1/messages`, { method: "POST", headers: fwdH, body: JSON.stringify(req.body) });
    if (userKeyId) db.update(userKeysTable).set({ usageCount: sql`${userKeysTable.usageCount} + 1`, lastUsedAt: new Date() }).where(eq(userKeysTable.id, userKeyId)).catch(() => {});
    const ct = upstream.headers.get("content-type") || "application/json";
    res.status(upstream.status).setHeader("content-type", ct);
    if (!upstream.ok || !upstream.body) { const text = await upstream.text(); res.send(text); return; }
    const reader = upstream.body.getReader();
    while (true) { const { done, value } = await reader.read(); if (done) break; res.write(value); }
    res.end();
  } catch (err) {
    req.log.error({ err }, "Claude proxy error");
    if (!res.headersSent) res.status(500).json({ type: "error", error: { type: "api_error", message: String(err) } }); else res.end();
  }
});

// ── PROXY: OpenAI-compatible — for Codex CLI / Cursor / Continue.dev ──────────
// Set: OPENAI_API_KEY=<your-cc-key> OPENAI_BASE_URL=<host>/api/proxy/codex
// Codex CLI will POST to /api/proxy/codex/v1/chat/completions automatically.

router.get("/proxy/codex/v1/models", (_req, res) => {
  res.json({
    object: "list",
    data: ["gpt-5.4", "gpt-5.4-mini", "gpt-5", "gpt-4o", "o3", "o4-mini"].map(id => ({
      id, object: "model", created: 1700000000, owned_by: "openai",
    })),
  });
});

router.post("/proxy/codex/v1/chat/completions", async (req, res) => {
  const authH = (req.headers["authorization"] as string | undefined)?.replace(/^bearer\s+/i, "");
  const xKey = req.headers["x-api-key"] as string | undefined;
  const inKey = authH || xKey;
  let userKeyId: string | undefined;
  if (inKey?.startsWith("sk-cc-")) {
    const rows = await db.select().from(userKeysTable).where(eq(userKeysTable.key, inKey)).limit(1);
    if (!rows[0] || !rows[0].isActive) { res.status(401).json({ error: { message: "Invalid or inactive API key", type: "invalid_request_error" } }); return; }
    userKeyId = rows[0].id;
  }
  const requestedModel = (req.body as { model?: string }).model || "codex";
  const ruleName = isRoutingModel(requestedModel) ? extractRuleName(requestedModel) : requestedModel;
  const result = await resolveRoute(ruleName);
  if (!result.ok) {
    const msg = result.reason === "all_rate_limited" ? `All providers for "${ruleName}" are rate-limited.` : `No routing rule for "\". Create one in Smart Routing.`;
    res.status(result.reason === "all_rate_limited" ? 429 : 503).json({ error: { message: msg, type: "api_error" } }); return;
  }
  const { apiKey: rKey, apiBaseUrl: rUrl } = result.route;
  if (!rKey || !rUrl) { res.status(400).json({ error: { message: "No API key/URL in routing rule.", type: "api_error" } }); return; }
  try {
    const fwdH: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (["host","connection","transfer-encoding","content-length","authorization","x-api-key"].includes(k)) continue;
      if (typeof v === "string") fwdH[k] = v; else if (Array.isArray(v)) fwdH[k] = v.join(", ");
    }
    fwdH["authorization"] = `Bearer ${rKey}`;
    if (!fwdH["content-type"]) fwdH["content-type"] = "application/json";
    const base = rUrl.replace(/\/$/, "");
    const upstream = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers: fwdH, body: JSON.stringify(req.body) });
    if (userKeyId) db.update(userKeysTable).set({ usageCount: sql`${userKeysTable.usageCount} + 1`, lastUsedAt: new Date() }).where(eq(userKeysTable.id, userKeyId)).catch(() => {});
    const ct = upstream.headers.get("content-type") || "application/json";
    res.status(upstream.status).setHeader("content-type", ct);
    if (!upstream.ok || !upstream.body) { const text = await upstream.text(); res.send(text); return; }
    const reader = upstream.body.getReader();
    while (true) { const { done, value } = await reader.read(); if (done) break; res.write(value); }
    res.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: { message: String(err), type: "api_error" } }); else res.end();
  }
});

// ── PROXY: OpenAI Responses API — for Codex CLI (wire_api = "responses") ──────
// Codex CLI config.toml: base_url = "<host>/api/proxy/codex", wire_api = "responses"
// Codex CLI sends: POST <base_url>/responses  (some versions also use /v1/responses)

async function handleCodexResponses(req: import("express").Request, res: import("express").Response) {
  const authHeader = (req.headers["authorization"] as string | undefined)?.replace(/^bearer\s+/i, "");
  const xApiKey = req.headers["x-api-key"] as string | undefined;
  const incomingKey = authHeader || xApiKey;

  let userKeyId: string | undefined;

  if (incomingKey?.startsWith("sk-cc-")) {
    const rows = await db.select().from(userKeysTable).where(eq(userKeysTable.key, incomingKey)).limit(1);
    if (!rows[0] || !rows[0].isActive) {
      res.status(401).json({ error: { message: "Invalid or inactive API key", type: "invalid_request_error", code: "invalid_api_key" } });
      return;
    }
    userKeyId = rows[0].id;
  }

  // Resolve provider via Smart Routing
  const requestedModel = (req.body as { model?: string }).model || "codex";
  const ruleName = isRoutingModel(requestedModel) ? extractRuleName(requestedModel) : requestedModel;
  req.log.info({ requestedModel, ruleName, bodyKeys: Object.keys(req.body ?? {}) }, "codex-responses: resolving route");
  const routeResult = await resolveRoute(ruleName);
  req.log.info({ ok: routeResult.ok, reason: (routeResult as { reason?: string }).reason }, "codex-responses: route result");

  if (!routeResult.ok) {
    const msg = routeResult.reason === "all_rate_limited"
      ? `All providers for "${ruleName}" are rate-limited. Try again shortly.`
      : `No routing rule found for model "${requestedModel}". Create a Smart Routing rule in the admin panel.`;
    res.status(routeResult.reason === "all_rate_limited" ? 429 : 404).json({ error: { message: msg, type: "api_error" } });
    return;
  }

  const { apiKey: routeApiKey, apiBaseUrl } = routeResult.route;
  if (!routeApiKey || !apiBaseUrl) {
    res.status(400).json({ error: { message: "No API key or base URL configured in routing rule. Edit the rule and add a provider.", type: "api_error" } });
    return;
  }

  try {
    const fwdHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (["host","connection","transfer-encoding","content-length","authorization","x-api-key"].includes(k)) continue;
      if (typeof v === "string") fwdHeaders[k] = v;
      else if (Array.isArray(v)) fwdHeaders[k] = v.join(", ");
    }
    fwdHeaders["authorization"] = `Bearer ${routeApiKey}`;
    if (!fwdHeaders["content-type"]) fwdHeaders["content-type"] = "application/json";

    const base = apiBaseUrl.replace(/\/$/, "");
    const upstream = await fetch(`${base}/v1/responses`, {
      method: "POST",
      headers: fwdHeaders,
      body: JSON.stringify(req.body),
    });

    if (userKeyId) {
      db.update(userKeysTable)
        .set({ usageCount: sql`${userKeysTable.usageCount} + 1`, lastUsedAt: new Date() })
        .where(eq(userKeysTable.id, userKeyId))
        .catch(() => {});
    }

    const ct = upstream.headers.get("content-type") || "application/json";
    res.status(upstream.status).setHeader("content-type", ct);
    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text();
      res.send(text); return;
    }
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err) {
    req.log.error({ err }, "Codex responses proxy error");
    if (!res.headersSent) res.status(500).json({ error: { message: String(err), type: "api_error" } });
    else res.end();
  }
}

// All supported paths for Codex CLI (wire_api = "responses")
// Short:  base_url = "<host>/api/codex"   → <base_url>/responses or <base_url>/v1/responses
// Legacy: base_url = "<host>/api/proxy/codex"
router.post("/proxy/codex/responses",    handleCodexResponses);
router.post("/proxy/codex/v1/responses", handleCodexResponses);
router.post("/codex/responses",          handleCodexResponses);
router.post("/codex/v1/responses",       handleCodexResponses);

router.post("/chat/stream", async (req, res) => {
  const headerKey = req.headers["x-api-key"] as string | undefined;

  let userKeyId: string | undefined;
  const startTime = Date.now();

  if (headerKey?.startsWith("sk-cc-")) {
    const rows = await db.select().from(userKeysTable).where(eq(userKeysTable.key, headerKey)).limit(1);
    if (!rows[0]) { res.status(403).json({ error: "Invalid API key" }); return; }
    if (!rows[0].isActive) { res.status(403).json({ error: "API key is disabled" }); return; }
    const { checkUserRpm } = await import("../lib/user-rate-limiter.js");
    if (!checkUserRpm(rows[0].id, rows[0].rpmLimit)) {
      res.setHeader("Retry-After", "60");
      res.status(429).json({ error: `Rate limit exceeded — max ${rows[0].rpmLimit} requests/minute for this key` });
      return;
    }
    userKeyId = rows[0].id;
  }

  type WireFile = { data: string; mimeType: string; name?: string };
  type WireMessage = { role: string; content: string; images?: WireFile[] };

  const { messages, model, system } = req.body as {
    messages: WireMessage[];
    model?: string;
    system?: string;
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const isImage = (f: WireFile) => f.mimeType.startsWith("image/");
  const isPdf   = (f: WireFile) => f.mimeType === "application/pdf";
  const isText  = (f: WireFile) => f.mimeType.startsWith("text/");

  /** Decode base64 → UTF-8 string (for text files). */
  function b64toText(b64: string): string {
    try { return Buffer.from(b64, "base64").toString("utf-8"); } catch { return ""; }
  }

  // ── Vision / document content builders ───────────────────────────────────
  /**
   * Anthropic supports:
   *  - images  → type:"image"    source:{type:"base64", media_type, data}
   *  - PDFs    → type:"document" source:{type:"base64", media_type:"application/pdf", data}
   *  - text    → type:"text"     text:"<decoded content>"
   */
  function buildAnthropicContent(content: string, files?: WireFile[]) {
    if (!files || files.length === 0) return content;
    const parts: unknown[] = [];
    for (const f of files) {
      if (isImage(f)) {
        parts.push({ type: "image", source: { type: "base64", media_type: f.mimeType, data: f.data } });
      } else if (isPdf(f)) {
        parts.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: f.data } });
      } else if (isText(f)) {
        const decoded = b64toText(f.data);
        if (decoded) parts.push({ type: "text", text: `[File: ${f.name ?? "file.txt"}]\n${decoded}` });
      }
    }
    if (content) parts.push({ type: "text", text: content });
    return parts.length > 0 ? parts : content;
  }

  /**
   * OpenAI supports images via image_url. PDFs are not natively supported —
   * we inline PDF/text file content as a prefixed text block instead.
   */
  function buildOpenAIContent(content: string, files?: WireFile[]) {
    if (!files || files.length === 0) return content;
    const parts: unknown[] = [];
    for (const f of files) {
      if (isImage(f)) {
        parts.push({ type: "image_url", image_url: { url: `data:${f.mimeType};base64,${f.data}` } });
      } else if (isText(f)) {
        const decoded = b64toText(f.data);
        if (decoded) parts.push({ type: "text", text: `[File: ${f.name ?? "file.txt"}]\n${decoded}` });
      } else if (isPdf(f)) {
        // PDFs not supported by OpenAI — notify the model
        parts.push({ type: "text", text: `[PDF attached: ${f.name ?? "document.pdf"} — this provider does not support PDF content directly]` });
      }
    }
    if (content) parts.push({ type: "text", text: content });
    return parts.length > 1 ? parts : content;
  }

  /**
   * Gemini supports images and PDFs as inlineData. Text files are injected as text parts.
   */
  function buildGeminiParts(content: string, files?: WireFile[]) {
    const parts: unknown[] = [];
    if (files && files.length > 0) {
      for (const f of files) {
        if (isImage(f) || isPdf(f)) {
          parts.push({ inlineData: { mimeType: f.mimeType, data: f.data } });
        } else if (isText(f)) {
          const decoded = b64toText(f.data);
          if (decoded) parts.push({ text: `[File: ${f.name ?? "file.txt"}]\n${decoded}` });
        }
      }
    }
    if (content) parts.push({ text: content });
    return parts;
  }

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  const requestedModel = model || "zai-org/GLM-5";

  // ── Smart Routing: resolve route:* model references ──────────────────────
  let selectedModel = requestedModel;
  let routedCustomApiKey: string | undefined;
  let routedCustomBaseUrl: string | undefined;
  let routedCustomProviderId: string | undefined;
  let isRoutedCustom = false;
  let routeRuleName: string | undefined;
  let triedRouteKeys: string[] = [];
  let currentRateLimitKey = "";
  let currentRpmLimit = 0;

  // ALL requests go through Smart Routing
  routeRuleName = isRoutingModel(requestedModel) ? extractRuleName(requestedModel) : requestedModel;
  {
    const result = await resolveRoute(routeRuleName);
    if (!result.ok) {
      const errMsg = result.reason === "all_rate_limited"
        ? `All providers for "${routeRuleName}" are rate-limited. Try again shortly.`
        : `No routing rule found for model "${requestedModel}". Please create a Smart Routing rule in the admin panel.`;
      res.status(result.reason === "all_rate_limited" ? 429 : 404).json({ error: errMsg });
      return;
    }
    selectedModel = result.route.modelId;
    triedRouteKeys.push(result.route.rateLimitKey);
    currentRateLimitKey = result.route.rateLimitKey;
    currentRpmLimit     = result.route.rpmLimit;
    req.log.info({ ruleName: routeRuleName, resolved: result.route }, "Smart routing resolved");

    if (result.route.providerType === "custom") {
      isRoutedCustom = true;
      routedCustomApiKey = result.route.apiKey;
      routedCustomBaseUrl = result.route.apiBaseUrl;
      routedCustomProviderId = result.route.providerId;
    }
  }

  // ── Client-disconnect guard — aborts upstream the moment the client drops ─────
  // Without this, long agentic tool calls (Codex, Claude Code) keep running
  // and burning credits even after the client disconnects or retries.
  const clientAbort = new AbortController();
  req.on("close", () => { if (!res.writableEnded) clientAbort.abort(); });
  const isAbort = (e: unknown): boolean => e instanceof Error && e.name === "AbortError";

  // ── Logging helper ────────────────────────────────────────────────────────────
  const logRequest = (status: "ok" | "error", errorMsg?: string) => {
    const elapsedMs = Date.now() - startTime;
    const ops: Promise<unknown>[] = [
      db.insert(requestLogsTable).values({
        id: randomUUID(),
        userKeyId: userKeyId ?? null,
        ccKeyId: null,
        model: selectedModel,
        elapsedMs,
        status,
        errorMsg: errorMsg?.slice(0, 255) ?? null,
      }),
    ];
    if (userKeyId) {
      ops.push(
        db.update(userKeysTable)
          .set({ usageCount: sql`${userKeysTable.usageCount} + 1`, lastUsedAt: new Date() })
          .where(eq(userKeysTable.id, userKeyId))
      );
    }
    Promise.all(ops).catch(() => {});
  };

  // ── SSE helpers ───────────────────────────────────────────────────────────────
  const flush = (r: typeof res) => (r as unknown as { flush?: () => void }).flush?.();

  const startSse = () => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Transfer-Encoding", "chunked");
    // Disable TCP Nagle to send SSE chunks immediately without batching
    (res.socket as import("node:net").Socket | null)?.setNoDelay?.(true);
    res.flushHeaders();
  };

  const sendText = (text: string) => {
    res.write(`data: ${JSON.stringify({ type: "text-delta", id: "0", text })}\n\n`);
    flush(res);
  };

  // Attempt to switch to the next provider in the routing chain on failure.
  // Updates selectedModel + routing vars. Returns true if a new route was loaded.
  const tryFallback = async (): Promise<boolean> => {
    if (!routeRuleName) return false;
    const next = await resolveNextRoute(routeRuleName, triedRouteKeys);
    if (!next) return false;
    req.log.warn({ next, triedKeys: triedRouteKeys }, "Routing fallback: switching to next provider in chain");
    selectedModel          = next.modelId;
    isRoutedCustom         = next.providerType === "custom";
    routedCustomApiKey     = next.apiKey;
    routedCustomBaseUrl    = next.apiBaseUrl;
    routedCustomProviderId = next.providerId;
    currentRateLimitKey    = next.rateLimitKey;
    currentRpmLimit        = next.rpmLimit;
    triedRouteKeys.push(next.rateLimitKey);
    return true;
  };

  // ── Provider execution loop (retries via routing chain on upstream errors) ──
  routingLoop: while (true) {
  const isAiGoCode  = selectedModel.startsWith("ag:");

  // ════════════════════════════════════════════════════════════════════════════
  // AIGOCODE path
  // ════════════════════════════════════════════════════════════════════════════
  if (isAiGoCode) {
    const agKey = req.headers["x-aigocode-key"] as string | undefined;
    if (!agKey) {
      res.status(400).json({ error: "AiGoCode API key required. Add your key in settings." });
      return;
    }

    const rawModelId = selectedModel.replace(/^ag:/, "");
    const apiType = getAgApiType(selectedModel);
    const systemMsg = system || "You are a helpful AI assistant.";

    req.log.info({ rawModelId, apiType }, "AG stream request");

    let upstreamUrl: string;
    let upstreamHeaders: Record<string, string>;
    let upstreamBody: Record<string, unknown>;

    if (apiType === "anthropic") {
      upstreamUrl = `${AG_BASE}/v1/messages`;
      upstreamHeaders = {
        "Content-Type": "application/json",
        "x-api-key": agKey,
        "anthropic-version": "2023-06-01",
      };
      upstreamBody = {
        model: rawModelId,
        messages: messages.map((m) => ({
          role: m.role,
          content: buildAnthropicContent(m.content, m.images),
        })),
        system: systemMsg,
        max_tokens: 16000,
        stream: true,
      };
    } else if (apiType === "gemini") {
      upstreamUrl = `${AG_BASE}/v1beta/models/${rawModelId}:streamGenerateContent?alt=sse`;
      upstreamHeaders = {
        "Content-Type": "application/json",
        "x-api-key": agKey,
      };
      upstreamBody = {
        contents: messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: buildGeminiParts(m.content, m.images),
        })),
        systemInstruction: systemMsg ? { parts: [{ text: systemMsg }] } : undefined,
        generationConfig: { temperature: 1 },
      };
    } else {
      // OpenAI-compatible (default)
      upstreamUrl = `${AG_BASE}/v1/chat/completions`;
      upstreamHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${agKey}`,
      };
      const allMsgs: unknown[] = systemMsg
        ? [{ role: "system", content: systemMsg }, ...messages.map((m) => ({
            role: m.role,
            content: buildOpenAIContent(m.content, m.images),
          }))]
        : messages.map((m) => ({
            role: m.role,
            content: buildOpenAIContent(m.content, m.images),
          }));
      upstreamBody = { model: rawModelId, messages: allMsgs, stream: true };
    }

    try {
      const upstream = await fetch(upstreamUrl, {
        method: "POST",
        headers: upstreamHeaders,
        body: JSON.stringify(upstreamBody),
        signal: clientAbort.signal,
      });

      if (!upstream.ok) {
        const text = await upstream.text();
        req.log.error({ status: upstream.status, body: text, upstreamUrl }, "AiGoCode API error");
        let userMessage = text.slice(0, 300);
        if (upstream.status === 401 || upstream.status === 403) {
          userMessage = `مفتاح AiGoCode غير صالح أو انتهت صلاحيته. (${upstream.status})`;
        }
        if (upstream.status === 429) penalizeRateLimit(currentRateLimitKey, currentRpmLimit);
        if (await tryFallback()) continue routingLoop;
        logRequest("error", userMessage.slice(0, 255));
        res.status(upstream.status).json({ error: userMessage });
        return;
      }

      startSse();
      if (!upstream.body) { logRequest("ok"); res.end(); return; }

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let lastEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event:")) { lastEvent = line.slice(6).trim(); continue; }
          if (!line.startsWith("data:")) { lastEvent = ""; continue; }
          const jsonStr = line.slice(5).trim();
          if (jsonStr === "[DONE]") { lastEvent = ""; continue; }
          try {
            const chunk = JSON.parse(jsonStr) as Record<string, unknown>;

            if (apiType === "openai") {
              const choices = chunk.choices as Array<{ delta?: { content?: string } }> | undefined;
              const content = choices?.[0]?.delta?.content;
              if (content) sendText(content);
            } else if (apiType === "anthropic") {
              if (lastEvent === "content_block_delta") {
                const delta = chunk.delta as { type?: string; text?: string } | undefined;
                if (delta?.type === "text_delta" && delta.text) sendText(delta.text);
              }
            } else if (apiType === "gemini") {
              const candidates = chunk.candidates as Array<{
                content?: { parts?: Array<{ text?: string }> };
              }> | undefined;
              const text = candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) sendText(text);
            }

            lastEvent = "";
          } catch { /* skip malformed */ }
        }
      }

      res.write("data: [DONE]\n\n");
      flush(res);
      logRequest("ok");
      res.end();
    } catch (err) {
      if (isAbort(err)) { if (!res.writableEnded) res.end(); return; }
      req.log.error({ err }, "Error proxying to AiGoCode");
      logRequest("error", String(err));
      if (!res.headersSent) {
        if (await tryFallback()) continue routingLoop;
        res.status(500).json({ error: "Internal server error" });
      }
    }
    return;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ROUTED CUSTOM PROVIDER path  — routing rule resolved to a custom provider
  // Uses the apiKey + baseUrl stored in the routing entry (set at rule creation)
  // ════════════════════════════════════════════════════════════════════════════
  if (isRoutedCustom) {
    let baseUrl = routedCustomBaseUrl;
    if (!baseUrl && routedCustomProviderId) {
      const providerRows = await db
        .select({ baseUrl: providersTable.baseUrl })
        .from(providersTable)
        .where(eq(providersTable.slug, routedCustomProviderId))
        .limit(1);
      baseUrl = providerRows[0]?.baseUrl;
    }
    if (!baseUrl) {
      res.status(400).json({ error: "Custom provider base URL not found" });
      return;
    }
    if (!routedCustomApiKey) {
      res.status(400).json({ error: "No API key configured for this routing rule entry. Edit the rule and select a key." });
      return;
    }

    const customMessages = (messages as Array<{ role: string; content: string }>)
      .map(m => ({ role: m.role, content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }));
    const systemMsg = system || "You are a helpful AI assistant.";
    const base = baseUrl.replace(/\/$/, "");

    const typesToTry: CustomApiType[] = ["openai", "codex", "anthropic"];
    let lastError = "";
    const customFlush = () => (res as unknown as { flush?: () => void }).flush?.();
    const customSendText = (text: string) => {
      res.write(`data: ${JSON.stringify({ type: "text-delta", id: "0", text })}\n\n`);
      customFlush();
    };

    for (const type of typesToTry) {
      const { url, headers, body: upBody } = buildCustomUpstream(base, type, routedCustomApiKey, selectedModel, customMessages, systemMsg);
      try {
        const upstream = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(upBody),
          signal: clientAbort.signal,
        });
        if (!upstream.ok) {
          lastError = (await upstream.text().catch(() => `HTTP ${upstream.status}`)).slice(0, 300);
          continue;
        }

        startSse();
        if (!upstream.body) { logRequest("ok"); res.write("data: [DONE]\n\n"); res.end(); return; }

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let lastEvent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (line.startsWith("event:")) { lastEvent = line.slice(6).trim(); continue; }
            if (!line.startsWith("data:")) { lastEvent = ""; continue; }
            const jsonStr = line.slice(5).trim();
            if (jsonStr === "[DONE]") { lastEvent = ""; continue; }
            const text = parseCustomChunk(type, jsonStr, lastEvent);
            if (text) customSendText(text);
            lastEvent = "";
          }
        }
        res.write("data: [DONE]\n\n");
        customFlush();
        logRequest("ok");
        res.end();
        return;
      } catch (err) {
        if (isAbort(err)) { if (!res.writableEnded) res.end(); return; }
        lastError = String(err).slice(0, 200);
        req.log.warn({ type, err }, "Routed custom stream attempt failed");
      }
    }
    if (!res.headersSent && await tryFallback()) continue routingLoop;
    logRequest("error", lastError);
    if (!res.headersSent) res.status(502).json({ error: `Custom provider stream failed: ${lastError}` });
    return;
  }

  logRequest("error", "No provider handled this request");
  if (!res.headersSent) res.status(500).json({ error: "No provider handler matched for this request" });
  break;
  } // end routingLoop
});

// ════════════════════════════════════════════════════════════════════════════
// OPENAI-COMPATIBLE ENDPOINTS  — /v1/chat/completions + /v1/models
// Allows using the standard openai SDK with this server as base_url.
// Auth: Authorization: Bearer sk-cc-<key>
// Supports streaming and non-streaming. Only CC models (not rc:/ag: prefixed).
// ════════════════════════════════════════════════════════════════════════════

// GET /v1/models — returns active routing rules as OpenAI-format model list
router.get("/v1/models", async (req, res) => {
  const authHeader = req.headers["authorization"] as string | undefined;
  const bearerKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : undefined;
  if (!bearerKey?.startsWith("sk-cc-")) {
    res.status(401).json({ error: { message: "Bearer token required (sk-cc-...)", type: "invalid_request_error", code: "invalid_api_key" } }); return;
  }
  const rows = await db.select().from(userKeysTable).where(eq(userKeysTable.key, bearerKey)).limit(1);
  if (!rows[0] || !rows[0].isActive) {
    res.status(401).json({ error: { message: "Invalid or disabled API key", type: "invalid_request_error", code: "invalid_api_key" } }); return;
  }
  const rules = await db.select({ name: routingRulesTable.name, createdAt: routingRulesTable.createdAt })
    .from(routingRulesTable).where(eq(routingRulesTable.isActive, true));
  const models = rules.map(r => ({
    id: `route:${r.name}`,
    object: "model",
    created: Math.floor(new Date(r.createdAt).getTime() / 1000),
    owned_by: "smart-routing",
  }));
  res.json({ object: "list", data: models });
});

// POST /v1/chat/completions — OpenAI-compatible chat completions (via Smart Routing)
router.post("/v1/chat/completions", async (req, res) => {
  const authHeader = req.headers["authorization"] as string | undefined;
  const bearerKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : undefined;
  if (!bearerKey?.startsWith("sk-cc-")) {
    res.status(401).json({ error: { message: "Bearer token required (sk-cc-...)", type: "invalid_request_error", code: "invalid_api_key" } }); return;
  }
  const rows = await db.select().from(userKeysTable).where(eq(userKeysTable.key, bearerKey)).limit(1);
  if (!rows[0]) { res.status(401).json({ error: { message: "Invalid API key", type: "invalid_request_error", code: "invalid_api_key" } }); return; }
  if (!rows[0].isActive) { res.status(401).json({ error: { message: "API key is disabled", type: "invalid_request_error", code: "invalid_api_key" } }); return; }
  const userKeyId = rows[0].id;
  const startTime = Date.now();
  const clientAbort2 = new AbortController();
  req.on("close", () => { if (!res.writableEnded) clientAbort2.abort(); });
  type OAIMessage = { role: string; content: string };
  const { model, messages, stream = false } = req.body as { model?: string; messages?: OAIMessage[]; stream?: boolean };
  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: { message: "messages array is required", type: "invalid_request_error" } }); return;
  }
  const requestedModel = model ?? "gpt-5.5";
  const ruleName = isRoutingModel(requestedModel) ? extractRuleName(requestedModel) : requestedModel;
  const routeResult = await resolveRoute(ruleName);
  if (!routeResult.ok) {
    const msg = routeResult.reason === "all_rate_limited" ? `All providers for "${ruleName}" are rate-limited.` : `No routing rule for "${requestedModel}". Create one in Smart Routing.`;
    res.status(routeResult.reason === "all_rate_limited" ? 429 : 404).json({ error: { message: msg, type: "api_error" } }); return;
  }
  const { modelId: selectedModel, apiKey: rKey, apiBaseUrl: rUrl } = routeResult.route;
  if (!rKey || !rUrl) { res.status(400).json({ error: { message: "No API key/URL configured in routing rule.", type: "api_error" } }); return; }
  const logReq = (status: "ok" | "error", errorMsg?: string) => {
    const elapsedMs = Date.now() - startTime;
    Promise.all([
      db.insert(requestLogsTable).values({ id: randomUUID(), userKeyId, ccKeyId: null, model: selectedModel, elapsedMs, status, errorMsg: errorMsg?.slice(0, 255) ?? null }),
      db.update(userKeysTable).set({ usageCount: sql`${userKeysTable.usageCount} + 1`, lastUsedAt: new Date() }).where(eq(userKeysTable.id, userKeyId)),
    ]).catch(() => {});
  };
  const systemMsg = messages.find(m => m.role === "system")?.content ?? "You are a helpful AI assistant.";
  const chatMessages = messages.filter(m => m.role !== "system");
  const base = rUrl.replace(/\/$/, "");
  const completionId = `chatcmpl-${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const created = Math.floor(Date.now() / 1000);
  try {
    const fwdH = { "Content-Type": "application/json", Authorization: `Bearer ${rKey}` };
    const upBody = { model: selectedModel, messages: [{ role: "system", content: systemMsg }, ...chatMessages], stream: true };
    const upstream = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers: fwdH, body: JSON.stringify(upBody), signal: clientAbort2.signal });
    if (!upstream.ok) {
      const text = await upstream.text();
      logReq("error", text.slice(0, 255));
      res.status(upstream.status).json({ error: { message: text.slice(0, 300), type: "api_error" } }); return;
    }
    if (!upstream.body) { logReq("ok"); res.end(); return; }
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let lineBuffer = "";
    let fullText = "";
    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      (res.socket as import("node:net").Socket | null)?.setNoDelay?.(true);
      res.flushHeaders();
      const flush = () => (res as unknown as { flush?: () => void }).flush?.();
      res.write(`data: ${JSON.stringify({ id: completionId, object: "chat.completion.chunk", created, model: selectedModel, choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }] })}\n\n`);
      flush();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split("\n"); lineBuffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim(); if (!trimmed) continue;
          const jsonStr = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
          if (jsonStr === "[DONE]") continue;
          try {
            const chunk = JSON.parse(jsonStr) as { choices?: Array<{ delta?: { content?: string } }> };
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) { res.write(`data: ${JSON.stringify({ id: completionId, object: "chat.completion.chunk", created, model: selectedModel, choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`); flush(); }
          } catch { /* skip malformed */ }
        }
      }
      res.write(`data: ${JSON.stringify({ id: completionId, object: "chat.completion.chunk", created, model: selectedModel, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
      res.write("data: [DONE]\n\n"); flush(); logReq("ok"); res.end();
    } else {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split("\n"); lineBuffer = lines.pop() ?? "";
        for (const line of lines) {
          const jsonStr = line.trim().startsWith("data:") ? line.trim().slice(5).trim() : line.trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;
          try { const chunk = JSON.parse(jsonStr) as { choices?: Array<{ delta?: { content?: string } }> }; const content = chunk.choices?.[0]?.delta?.content; if (content) fullText += content; } catch { /* skip */ }
        }
      }
      logReq("ok");
      res.json({ id: completionId, object: "chat.completion", created, model: selectedModel, choices: [{ index: 0, message: { role: "assistant", content: fullText }, finish_reason: "stop" }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } });
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") { if (!res.writableEnded) res.end(); return; }
    logReq("error", String(err));
    if (!res.headersSent) res.status(500).json({ error: { message: "Internal server error", type: "server_error" } });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ANTHROPIC-COMPATIBLE ENDPOINT  — POST /v1/messages
// Routes through Smart Routing; Claude Code: ANTHROPIC_BASE_URL=<host>/api
// ════════════════════════════════════════════════════════════════════════════

router.post("/v1/messages", async (req, res) => {
  const xApiKey = req.headers["x-api-key"] as string | undefined;
  const authHeader = req.headers["authorization"] as string | undefined;
  const bearerKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : undefined;
  const userKey = xApiKey || bearerKey;
  if (!userKey?.startsWith("sk-cc-")) {
    res.status(401).json({ type: "error", error: { type: "authentication_error", message: "API key required (sk-cc-...)" } }); return;
  }
  const rows = await db.select().from(userKeysTable).where(eq(userKeysTable.key, userKey)).limit(1);
  if (!rows[0] || !rows[0].isActive) {
    res.status(401).json({ type: "error", error: { type: "authentication_error", message: "Invalid or disabled API key" } }); return;
  }
  const userKeyId = rows[0].id;
  const startTime = Date.now();
  const body = req.body as Record<string, unknown>;
  const requestedModel = (body.model as string | undefined) ?? "claude";
  const ruleName = isRoutingModel(requestedModel) ? extractRuleName(requestedModel) : requestedModel;
  const routeResult = await resolveRoute(ruleName);
  if (!routeResult.ok) {
    const msg = routeResult.reason === "all_rate_limited" ? `All providers for "${ruleName}" are rate-limited.` : `No routing rule for "${requestedModel}". Create one in Smart Routing.`;
    res.status(routeResult.reason === "all_rate_limited" ? 429 : 404).json({ type: "error", error: { type: "api_error", message: msg } }); return;
  }
  const { apiKey: rKey, apiBaseUrl: rUrl } = routeResult.route;
  if (!rKey || !rUrl) { res.status(400).json({ type: "error", error: { type: "api_error", message: "No API key/URL configured in routing rule." } }); return; }
  const clientAbortMsg = new AbortController();
  req.on("close", () => { if (!res.writableEnded) clientAbortMsg.abort(); });
  let upstream: Response;
  try {
    const base = rUrl.replace(/\/$/, "");
    upstream = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": rKey,
        "anthropic-version": (req.headers["anthropic-version"] as string | undefined) ?? "2023-06-01",
        ...(req.headers["anthropic-beta"] ? { "anthropic-beta": req.headers["anthropic-beta"] as string } : {}),
      },
      body: JSON.stringify(body),
      signal: clientAbortMsg.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") { if (!res.writableEnded) res.end(); return; }
    res.status(502).json({ type: "error", error: { type: "api_error", message: String(err) } }); return;
  }
  const logAnthropicReq = (status: "ok" | "error") => {
    const elapsedMs = Date.now() - startTime;
    Promise.all([
      db.insert(requestLogsTable).values({ id: randomUUID(), userKeyId, ccKeyId: null, model: String(body.model ?? "claude"), elapsedMs, status, errorMsg: null }),
      db.update(userKeysTable).set({ usageCount: sql`${userKeysTable.usageCount} + 1`, lastUsedAt: new Date() }).where(eq(userKeysTable.id, userKeyId)),
    ]).catch(() => {});
  };
  if (!upstream.ok) {
    const text = await upstream.text(); logAnthropicReq("error");
    res.status(upstream.status).set("Content-Type", "application/json").send(text); return;
  }
  const ct = upstream.headers.get("content-type") ?? "application/json";
  res.setHeader("Content-Type", ct);
  let heartbeatV1Msg: ReturnType<typeof setInterval> | null = null;
  if (ct.includes("text/event-stream")) {
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    (res.socket as import("node:net").Socket | null)?.setNoDelay?.(true);
    res.flushHeaders();
    heartbeatV1Msg = setInterval(() => { if (!res.writableEnded) res.write(":\n\n"); }, 30_000);
  }
  if (!upstream.body) { if (heartbeatV1Msg) clearInterval(heartbeatV1Msg); logAnthropicReq("ok"); res.end(); return; }
  const anthropicReader = upstream.body.getReader();
  try {
    while (true) { const { done, value } = await anthropicReader.read(); if (done) break; res.write(value); }
    logAnthropicReq("ok"); res.end();
  } catch (err) {
    logAnthropicReq("error"); req.log.error({ err }, "Error streaming /v1/messages response");
    if (!res.headersSent) res.status(500).json({ type: "error", error: { type: "api_error", message: "Stream error" } });
  } finally { if (heartbeatV1Msg) clearInterval(heartbeatV1Msg); }
});

// ════════════════════════════════════════════════════════════════════════════
// OPENAI RESPONSES API ENDPOINT  — POST /v1/responses
// Routes through Smart Routing; Codex CLI: OPENAI_BASE_URL=<host>/api
// ════════════════════════════════════════════════════════════════════════════

router.post("/v1/responses", async (req, res) => {
  const authHeader = req.headers["authorization"] as string | undefined;
  const bearerKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : undefined;
  if (!bearerKey?.startsWith("sk-cc-")) {
    res.status(401).json({ error: { message: "Bearer token required (sk-cc-...)", type: "invalid_request_error", code: "invalid_api_key" } }); return;
  }
  const rows = await db.select().from(userKeysTable).where(eq(userKeysTable.key, bearerKey)).limit(1);
  if (!rows[0] || !rows[0].isActive) {
    res.status(401).json({ error: { message: "Invalid or disabled API key", type: "invalid_request_error", code: "invalid_api_key" } }); return;
  }
  const userKeyId = rows[0].id;
  const body = req.body as Record<string, unknown>;
  const requestedModel = (body.model as string | undefined) ?? "codex";
  const ruleName = isRoutingModel(requestedModel) ? extractRuleName(requestedModel) : requestedModel;
  const routeResult = await resolveRoute(ruleName);
  if (!routeResult.ok) {
    const msg = routeResult.reason === "all_rate_limited" ? `All providers for "${ruleName}" are rate-limited.` : `No routing rule for "${requestedModel}". Create one in Smart Routing.`;
    res.status(routeResult.reason === "all_rate_limited" ? 429 : 404).json({ error: { message: msg, type: "api_error" } }); return;
  }
  const { apiKey: rKey, apiBaseUrl: rUrl } = routeResult.route;
  if (!rKey || !rUrl) { res.status(400).json({ error: { message: "No API key/URL configured in routing rule.", type: "api_error" } }); return; }
  const clientAbortRes = new AbortController();
  req.on("close", () => { if (!res.writableEnded) clientAbortRes.abort(); });
  let upstream: Response;
  try {
    const base = rUrl.replace(/\/$/, "");
    upstream = await fetch(`${base}/v1/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${rKey}` },
      body: JSON.stringify(body),
      signal: clientAbortRes.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") { if (!res.writableEnded) res.end(); return; }
    res.status(502).json({ error: { message: String(err), type: "api_error" } }); return;
  }
  const startTime = Date.now();
  const logReq = (status: "ok" | "error") => {
    const elapsedMs = Date.now() - startTime;
    Promise.all([
      db.insert(requestLogsTable).values({ id: randomUUID(), userKeyId, ccKeyId: null, model: String(body.model ?? "codex"), elapsedMs, status, errorMsg: null }),
      db.update(userKeysTable).set({ usageCount: sql`${userKeysTable.usageCount} + 1`, lastUsedAt: new Date() }).where(eq(userKeysTable.id, userKeyId)),
    ]).catch(() => {});
  };
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text(); logReq("error");
    res.status(upstream.status).set("Content-Type", "application/json").send(text); return;
  }
  const ct = upstream.headers.get("content-type") ?? "application/json";
  res.setHeader("Content-Type", ct);
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  if (ct.includes("text/event-stream")) {
    res.setHeader("Cache-Control", "no-cache, no-transform"); res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    (res.socket as import("node:net").Socket | null)?.setNoDelay?.(true);
    res.flushHeaders();
    heartbeat = setInterval(() => { if (!res.writableEnded) res.write(":\n\n"); }, 30_000);
  }
  const reader = upstream.body.getReader();
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; res.write(value); }
    logReq("ok"); res.end();
  } catch (err) {
    logReq("error"); req.log.error({ err }, "Error streaming /v1/responses");
    if (!res.headersSent) res.status(500).json({ error: { message: "Stream error", type: "api_error" } });
  } finally { if (heartbeat) clearInterval(heartbeat); }
});

export default router;

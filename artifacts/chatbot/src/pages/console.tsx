import { useState, useEffect, useCallback, useRef } from "react";
import { useGetChatModels, useGetChatRcModels, useGetChatAgModels } from "@workspace/api-client-react";
import { useAdminAuth, useAdminFetch } from "@/context/admin-auth";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useRightCodeKey } from "@/hooks/use-rightcode-key";
import { useAiGoCodeKey } from "@/hooks/use-aigocode-key";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectGroup, SelectItem,
  SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Terminal, Lock, Unlock, Plus, Trash2, Copy, CheckCircle2,
  Loader2, ToggleLeft, ToggleRight, RefreshCw, ChevronRight,
  Cpu, Video, Mic, Globe, Key, Send, SquareSquare, Clock,
  AlertTriangle, ExternalLink, Eye, EyeOff, X, Pencil, Sun, Moon,
  GitBranch, GripVertical, ArrowUp, ArrowDown,
} from "lucide-react";
import { useTheme } from "@/context/theme";

// ─── Types ────────────────────────────────────────────────────────────────────

type NavItem = string;

type RoutingProviderEntry = {
  providerType: "cc" | "rc" | "ag" | "custom";
  providerId?: string;
  modelId: string;
  rpmLimit: number;
  priority: number;
  /** For custom providers: the actual key value stored in the rule */
  apiKey?: string;
  /** For custom providers: optional base URL override */
  apiBaseUrl?: string;
};

type RoutingRule = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  providers: RoutingProviderEntry[];
  createdAt: string;
};

type ProviderType = "text" | "video" | "audio";

type CustomProvider = {
  id: string; name: string; slug: string; type: string;
  baseUrl: string; authMethod: string; isActive: boolean;
  channels: { prefix: string; apiType: string; displayName: string }[];
  notes: string | null; createdAt: string;
};

type UserKey = {
  id: string; label: string; key: string; isActive: boolean;
  usageCount: number; lastUsedAt: string | null; createdAt: string;
};



function formatMs(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function typeIcon(t: string, size = "w-3.5 h-3.5") {
  if (t === "video") return <Video className={`${size} text-violet-400`} />;
  if (t === "audio") return <Mic className={`${size} text-blue-400`} />;
  return <Cpu className={`${size} text-emerald-400`} />;
}

// ─── Admin Lock Banner ────────────────────────────────────────────────────────

function AdminLockBanner({ onUnlock }: { onUnlock: () => void }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/5 border-b border-amber-500/20 text-xs font-sans">
      <Lock className="w-3 h-3 text-amber-400 flex-none" />
      <span className="text-amber-400/80">Management features require admin access.</span>
      <button onClick={onUnlock} className="ml-1 underline text-amber-400 hover:text-amber-300">Unlock</button>
    </div>
  );
}

// ─── Inline Login Dialog ──────────────────────────────────────────────────────

function LoginDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { login } = useAdminAuth();
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!pw) return;
    setLoading(true); setErr("");
    const res = await login(pw);
    setLoading(false);
    if (res.ok) onSuccess();
    else setErr(res.error ?? "Invalid password");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl p-6 w-80 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-primary" />
            <span className="font-bold text-sm">Admin Access</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="relative">
          <Input
            type={show ? "text" : "password"}
            value={pw} onChange={(e) => { setPw(e.target.value); setErr(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            className="h-9 text-sm font-mono pr-9 bg-background/60"
            placeholder="Admin password" autoFocus
            autoComplete="current-password"
          />
          <button onClick={() => setShow(v => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground">
            {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
        {err && <p className="text-xs text-destructive font-sans">{err}</p>}
        <Button className="w-full h-9" onClick={submit} disabled={loading || !pw}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Unlock"}
        </Button>
      </div>
    </div>
  );
}

// ─── Providers Panel ──────────────────────────────────────────────────────────

const BUILTIN_PROVIDERS = [
  {
    slug: "commandcode", name: "CommandCode", type: "text" as ProviderType,
    baseUrl: "https://api.commandcode.ai", note: "Built-in · round-robin key pool",
    detail: "12+ models",
  },
  {
    slug: "rightcode", name: "Right Code", type: "text" as ProviderType,
    baseUrl: "https://right.codes", note: "Built-in · 7 channels",
    detail: "58+ models",
  },
];

function ProvidersPanel({ isAdmin, onProvidersChange }: { isAdmin: boolean; onProvidersChange?: () => void }) {
  const apiFetch = useAdminFetch();
  const [providers, setProviders] = useState<CustomProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", baseUrl: "", apiKey: "" });
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [formErr, setFormErr] = useState("");

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    const res = await apiFetch("/api/admin/providers");
    if (res.ok) {
      const d = await res.json() as { providers: CustomProvider[] };
      setProviders(d.providers ?? []);
    }
    setLoading(false);
  }, [apiFetch, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const slugify = (s: string) => s.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  const save = async () => {
    if (!form.name.trim() || !form.baseUrl.trim()) {
      setFormErr("الاسم والرابط مطلوبان"); return;
    }
    const slug = slugify(form.name);
    setSaving(true); setFormErr("");
    const res = await apiFetch("/api/admin/providers", {
      method: "POST", body: JSON.stringify({ name: form.name, slug, type: "text", baseUrl: form.baseUrl, authMethod: "bearer", notes: "" }),
    });
    if (res.ok) {
      if (form.apiKey.trim()) localStorage.setItem(`provider_key_${slug}`, form.apiKey.trim());
      setShowForm(false);
      setForm({ name: "", baseUrl: "", apiKey: "" });
      setShowApiKey(false);
      await load();
      onProvidersChange?.();
    } else {
      const d = await res.json() as { error?: string };
      setFormErr(d.error ?? "Failed to save");
    }
    setSaving(false);
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", baseUrl: "" });
  const [editSaving, setEditSaving] = useState(false);

  const startEdit = (p: CustomProvider) => {
    setEditingId(p.id);
    setEditForm({ name: p.name, baseUrl: p.baseUrl });
  };

  const cancelEdit = () => { setEditingId(null); };

  const saveEdit = async (id: string) => {
    if (!editForm.name.trim() || !editForm.baseUrl.trim()) return;
    setEditSaving(true);
    await apiFetch(`/api/admin/providers/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: editForm.name.trim(), baseUrl: editForm.baseUrl.trim() }),
    });
    setProviders(p => p.map(x => x.id === id ? { ...x, name: editForm.name.trim(), baseUrl: editForm.baseUrl.trim() } : x));
    setEditingId(null);
    setEditSaving(false);
    onProvidersChange?.();
  };

  const toggleActive = async (id: string, cur: boolean) => {
    await apiFetch(`/api/admin/providers/${id}`, { method: "PATCH", body: JSON.stringify({ isActive: !cur }) });
    setProviders(p => p.map(x => x.id === id ? { ...x, isActive: !cur } : x));
  };

  const del = async (id: string) => {
    if (!confirm("Delete this provider?")) return;
    await apiFetch(`/api/admin/providers/${id}`, { method: "DELETE" });
    setProviders(p => p.filter(x => x.id !== id));
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold tracking-tight">Providers</h2>
          <p className="text-[10px] text-muted-foreground font-sans mt-0.5">
            Manage AI providers and their channels
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" className="h-7 px-3 text-xs gap-1.5" onClick={() => setShowForm(v => !v)}>
            <Plus className="w-3.5 h-3.5" /> Add Provider
          </Button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="border border-border/60 rounded-lg p-4 bg-card/50 space-y-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">مزوّد جديد</p>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="h-9 text-sm bg-background/50" placeholder="الاسم (مثال: MyAI)" autoFocus />
          <Input value={form.baseUrl} onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
            className="h-9 text-sm font-mono bg-background/50" placeholder="https://api.example.com" />
          <div className="relative">
            <input
              type={showApiKey ? "text" : "password"}
              value={form.apiKey}
              onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
              className="w-full h-9 text-sm font-mono bg-background/50 border border-input rounded-md px-3 pr-9 text-foreground outline-none focus:ring-1 focus:ring-ring"
              placeholder="API Key (اختياري)"
            />
            <button type="button" onClick={() => setShowApiKey(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground">
              {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          {formErr && <p className="text-xs text-destructive font-sans">{formErr}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setShowForm(false); setFormErr(""); setShowApiKey(false); }}>
              إلغاء
            </Button>
            <Button size="sm" className="h-8 px-4 text-xs" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "حفظ"}
            </Button>
          </div>
        </div>
      )}

      {/* Built-in providers */}
      <div className="space-y-2">
        <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest">Built-in</p>
        {BUILTIN_PROVIDERS.map(p => (
          <div key={p.slug} className="flex items-center gap-3 border border-border/40 rounded-lg px-4 py-3 bg-card/20">
            <div className="flex-none">{typeIcon(p.type, "w-4 h-4")}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{p.name}</span>
                <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary/80">{p.type}</span>
              </div>
              <p className="text-[10px] text-muted-foreground font-sans mt-0.5">{p.note} · {p.detail}</p>
            </div>
            <div className="flex-none flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[10px] text-emerald-500/80 font-sans">active</span>
            </div>
          </div>
        ))}
      </div>

      {/* Custom providers */}
      {isAdmin && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest">Custom</p>
            <button onClick={load} className="text-muted-foreground/40 hover:text-muted-foreground">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : providers.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground/40 text-xs font-sans">
              No custom providers yet. Click "Add Provider" to get started.
            </div>
          ) : (
            providers.map(p => (
              <div key={p.id} className={`border rounded-lg transition-colors
                ${p.isActive ? "border-border/50 bg-card/30" : "border-border/20 bg-card/10 opacity-60"}`}>
                {editingId === p.id ? (
                  /* ── Edit form ── */
                  <div className="p-3 space-y-2">
                    <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest">تعديل المزود</p>
                    <Input value={editForm.name}
                      onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      className="h-8 text-xs bg-background/50" placeholder="الاسم" autoFocus />
                    <Input value={editForm.baseUrl}
                      onChange={e => setEditForm(f => ({ ...f, baseUrl: e.target.value }))}
                      className="h-8 text-xs font-mono bg-background/50" placeholder="https://api.example.com" />
                    <div className="flex justify-end gap-2 pt-1">
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelEdit}>إلغاء</Button>
                      <Button size="sm" className="h-7 px-3 text-xs" onClick={() => saveEdit(p.id)} disabled={editSaving}>
                        {editSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : "حفظ"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* ── Normal row ── */
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-none">{typeIcon(p.type ?? "text", "w-4 h-4")}</div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{p.name}</span>
                      <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5 truncate">{p.baseUrl}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-none">
                      <button onClick={() => startEdit(p)}
                        className="p-1.5 rounded text-muted-foreground/40 hover:text-foreground hover:bg-muted/20" title="تعديل">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={() => toggleActive(p.id, p.isActive)}
                        className="p-1.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/20">
                        {p.isActive ? <ToggleRight className="w-3.5 h-3.5 text-emerald-500" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => del(p.id)}
                        className="p-1.5 rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {!isAdmin && (
        <div className="text-center py-10 text-muted-foreground/40 text-xs font-sans">
          Unlock admin to manage custom providers.
        </div>
      )}
    </div>
  );
}

// ─── Integration Docs ─────────────────────────────────────────────────────────

const DOC_TABS = ["Python", "JavaScript", "Claude Code", "Codex CLI", "cURL"] as const;
type DocTab = typeof DOC_TABS[number];

function IntegrationDocs() {
  const [tab, setTab] = useState<DocTab>("Python");
  const [copied, setCopied] = useState(false);
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://your-domain.com";

  const snippets: Record<DocTab, string> = {
    Python: `from openai import OpenAI

client = OpenAI(
    api_key="sk-cc-YOUR_KEY",
    base_url="${baseUrl}/api/v1",
)

# Streaming
stream = client.chat.completions.create(
    model="zai-org/GLM-5",
    messages=[{"role": "user", "content": "مرحبا!"}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)

# Non-streaming
response = client.chat.completions.create(
    model="deepseek/deepseek-v3",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "ما هي عاصمة فرنسا؟"},
    ],
)
print(response.choices[0].message.content)`,

    JavaScript: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-cc-YOUR_KEY",
  baseURL: "${baseUrl}/api/v1",
});

// Streaming
const stream = await client.chat.completions.create({
  model: "zai-org/GLM-5",
  messages: [{ role: "user", content: "مرحبا!" }],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}

// Non-streaming
const response = await client.chat.completions.create({
  model: "deepseek/deepseek-v3",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "ما هي عاصمة فرنسا؟" },
  ],
});
console.log(response.choices[0].message.content);`,

    "Claude Code": `# ─── Claude Code ───────────────────────────────────────────────────
# يتصل بـ /api/v1/messages — يعمل عبر RC /claude-aws
# يتطلب وجود RC keys في الـ pool (إدارتها من Console → RC Keys)

# 1. تصدير المتغيرات (أو أضفها في ~/.bashrc / ~/.zshrc)
export ANTHROPIC_BASE_URL="${baseUrl}/api"
export ANTHROPIC_API_KEY="sk-cc-YOUR_KEY"

# 2. تشغيل Claude Code (مثال مع --dangerously-skip-permissions)
claude --dangerously-skip-permissions

# ── أو استخدام SDK مباشرةً (Python) ──────────────────────────────
import anthropic, os

client = anthropic.Anthropic(
    api_key="sk-cc-YOUR_KEY",
    base_url="${baseUrl}/api",
)

message = client.messages.create(
    model="claude-opus-4-5",
    max_tokens=4096,
    messages=[{"role": "user", "content": "مرحبا!"}],
)
print(message.content[0].text)

# ── Streaming ─────────────────────────────────────────────────────
with client.messages.stream(
    model="claude-opus-4-5",
    max_tokens=4096,
    messages=[{"role": "user", "content": "اشرح الذكاء الاصطناعي"}],
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)`,

    "Codex CLI": `# ─── Codex CLI ─────────────────────────────────────────────────────
# يتصل بـ /api/v1/responses — يعمل عبر RC /codex
# يتطلب وجود RC keys في الـ pool (إدارتها من Console → RC Keys)

# 1. تصدير المتغيرات
export OPENAI_BASE_URL="${baseUrl}/api"
export OPENAI_API_KEY="sk-cc-YOUR_KEY"

# 2. تشغيل Codex CLI
codex

# ── أو OpenClaw (يستخدم /v1/responses أيضاً) ─────────────────────
openclow --base-url "${baseUrl}/api" --api-key "sk-cc-YOUR_KEY"

# ── أو استخدام SDK مباشرةً (JavaScript) ──────────────────────────
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-cc-YOUR_KEY",
  baseURL: "${baseUrl}/api/v1",
});

// Codex Responses API format
const response = await client.responses.create({
  model: "codex-mini-latest",
  input: [{ role: "user", content: "اكتب لي دالة Python تحسب Fibonacci" }],
});
console.log(response.output_text);

// Streaming
const stream = await client.responses.create({
  model: "o4-mini",
  input: "افحص هذا الكود وأصلح أي مشاكل",
  stream: true,
});
for await (const event of stream) {
  if (event.type === "response.output_text.delta") {
    process.stdout.write(event.delta);
  }
}`,

    cURL: `# ─── /v1/chat/completions (OpenAI format) ──────────────────────────
curl ${baseUrl}/api/v1/chat/completions \\
  -H "Authorization: Bearer sk-cc-YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "zai-org/GLM-5",
    "messages": [{"role": "user", "content": "مرحبا!"}],
    "stream": true
  }'

# ─── /v1/messages (Anthropic format — Claude Code) ──────────────────
curl ${baseUrl}/api/v1/messages \\
  -H "x-api-key: sk-cc-YOUR_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-opus-4-5",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "مرحبا!"}]
  }'

# ─── /v1/responses (Codex format — Codex CLI) ───────────────────────
curl ${baseUrl}/api/v1/responses \\
  -H "Authorization: Bearer sk-cc-YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "codex-mini-latest",
    "input": [{"role": "user", "content": "اكتب hello world"}]
  }'

# ─── قائمة النماذج ──────────────────────────────────────────────────
curl ${baseUrl}/api/v1/models \\
  -H "Authorization: Bearer sk-cc-YOUR_KEY"`,
  };

  const copy = () => {
    navigator.clipboard.writeText(snippets[tab]).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-border/40 bg-card/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30 bg-card/30">
        <div>
          <p className="text-[10px] text-primary/70 uppercase tracking-wider font-medium">طريقة الاتصال</p>
          <p className="text-[10px] text-muted-foreground/60 font-sans mt-0.5">
            Base URL: <code className="font-mono text-primary/70">{baseUrl}/api/v1</code>
          </p>
        </div>
        <button onClick={copy}
          className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded border border-border/40 bg-background/50 hover:bg-muted/30 text-muted-foreground hover:text-foreground transition-colors">
          {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border/30 bg-background/20">
        {DOC_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-[11px] font-mono transition-colors ${
              tab === t
                ? "text-primary border-b-2 border-primary bg-primary/5"
                : "text-muted-foreground/60 hover:text-muted-foreground"
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Code */}
      <pre className="p-4 text-[11px] font-mono text-muted-foreground/80 overflow-x-auto whitespace-pre leading-relaxed bg-background/10 max-h-64 overflow-y-auto">
        {snippets[tab]}
      </pre>

      {/* Note */}
      <div className="px-4 py-2 border-t border-border/20 bg-card/10">
        <p className="text-[10px] text-muted-foreground/50 font-sans">
          استبدل <code className="font-mono text-primary/60">sk-cc-YOUR_KEY</code> بمفتاحك الفعلي.
          يدعم جميع نماذج CC — راجع قائمة النماذج في صفحة Test Chat.
        </p>
      </div>
    </div>
  );
}

// ─── API Keys Panel ───────────────────────────────────────────────────────────

function ApiKeysPanel({ isAdmin }: { isAdmin: boolean }) {
  const apiFetch = useAdminFetch();
  const [keys, setKeys] = useState<UserKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<UserKey | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    const res = await apiFetch("/api/admin/user-keys");
    if (res.ok) { const d = await res.json() as { keys: UserKey[] }; setKeys(d.keys ?? []); }
    setLoading(false);
  }, [apiFetch, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setCreating(true);
    const res = await apiFetch("/api/admin/user-keys", { method: "POST", body: JSON.stringify({ label: newLabel }) });
    const d = await res.json() as { key: UserKey };
    setNewKey(d.key); setNewLabel(""); setShowForm(false);
    await load(); setCreating(false);
  };

  const del = async (id: string) => {
    await apiFetch(`/api/admin/user-keys/${id}`, { method: "DELETE" });
    setKeys(p => p.filter(k => k.id !== id));
  };

  const toggle = async (id: string, cur: boolean) => {
    await apiFetch(`/api/admin/user-keys/${id}`, { method: "PATCH", body: JSON.stringify({ isActive: !cur }) });
    setKeys(p => p.map(k => k.id === id ? { ...k, isActive: !cur } : k));
  };

  const copy = (v: string) => {
    navigator.clipboard.writeText(v);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold tracking-tight">API Keys</h2>
          <p className="text-[10px] text-muted-foreground font-sans mt-0.5">
            Keys for external websites to connect to this API
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" className="h-7 px-3 text-xs gap-1.5" onClick={() => setShowForm(v => !v)}>
              <Plus className="w-3.5 h-3.5" /> Create Key
            </Button>
          </div>
        )}
      </div>

      {/* Integration docs */}
      <IntegrationDocs />

      {showForm && (
        <div className="border border-border/50 rounded-lg p-4 bg-card/50 space-y-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">New API Key</p>
          <Input value={newLabel} onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") create(); }}
            className="h-8 text-xs font-sans bg-background/50" placeholder="Label (e.g. My Website, App v2)" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" className="h-7 px-3 text-xs" onClick={create} disabled={creating}>
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Generate"}
            </Button>
          </div>
        </div>
      )}

      {newKey && (
        <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-lg p-4 space-y-2">
          <p className="text-[10px] text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Key created — copy it now
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-background/50 border border-border/40 rounded px-3 py-2 text-emerald-400 overflow-x-auto">
              {newKey.key}
            </code>
            <Button size="sm" variant="outline" className="h-8 px-2 text-xs gap-1.5 flex-none" onClick={() => copy(newKey.key)}>
              {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
          <button onClick={() => setNewKey(null)} className="text-[10px] text-muted-foreground hover:text-foreground">Dismiss</button>
        </div>
      )}

      {!isAdmin ? (
        <div className="text-center py-10 text-muted-foreground/40 text-xs font-sans">
          Unlock admin to manage API keys.
        </div>
      ) : loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
      ) : keys.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground/40 text-xs font-sans">
          No API keys yet. Create one to give external apps access.
        </div>
      ) : (
        <div className="space-y-2">
          {keys.map(k => (
            <div key={k.id} className={`border rounded-lg p-3 flex items-center gap-3 transition-colors
              ${k.isActive ? "border-border/50 bg-card/30" : "border-border/30 bg-card/10 opacity-60"}`}>
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{k.label}</span>
                  {!k.isActive && (
                    <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-muted/40 text-muted-foreground">disabled</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-sans flex-wrap">
                  <code className="font-mono">{k.key}</code>
                  <span>{k.usageCount.toLocaleString()} reqs</span>
                  {k.lastUsedAt && <span>last {new Date(k.lastUsedAt).toLocaleDateString()}</span>}
                  <span>{new Date(k.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-none">
                <button onClick={() => copy(k.key)}
                  className="p-1.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/20">
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => toggle(k.id, k.isActive)}
                  className="p-1.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/20">
                  {k.isActive ? <ToggleRight className="w-3.5 h-3.5 text-emerald-500" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => del(k.id)}
                  className="p-1.5 rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── Custom Provider Key Panel ────────────────────────────────────────────────

function CustomProviderKeyPanel({ provider }: { provider: CustomProvider }) {
  const storageKey = `provider_key_${provider.slug}`;
  const [key, setKey] = useState(() => localStorage.getItem(storageKey) ?? "");
  const [input, setInput] = useState(key);
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = () => {
    const val = input.trim();
    if (val) localStorage.setItem(storageKey, val);
    else localStorage.removeItem(storageKey);
    setKey(val);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const clear = () => {
    localStorage.removeItem(storageKey);
    setKey("");
    setInput("");
  };

  return (
    <div className="p-6 space-y-5 max-w-xl">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Key className="w-4 h-4 text-primary" />
        <h2 className="font-bold text-sm">{provider.name} — API Key</h2>
        {key && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-sans">مُفعَّل</span>}
      </div>
      <p className="text-xs text-muted-foreground font-sans leading-relaxed">
        المفتاح يُخزَّن محلياً في المتصفح ويُرسَل مع كل طلب لهذا المزود.
        <br />
        <span className="text-muted-foreground/60">Base URL: <code className="font-mono">{provider.baseUrl}</code></span>
      </p>

      {/* Key input */}
      <div className="space-y-2">
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">API Key</label>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Input
              type={show ? "text" : "password"}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && save()}
              placeholder="sk-…"
              className="h-8 text-xs font-mono pr-8"
            />
            <button onClick={() => setShow(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground">
              {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          <Button onClick={save} size="sm" className="h-8 text-xs px-3">
            {saved ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : "حفظ"}
          </Button>
        </div>
      </div>

      {/* Current stored key */}
      {key && (
        <div className="flex items-center justify-between bg-muted/20 border border-border/40 rounded px-3 py-2">
          <div>
            <p className="text-[10px] text-muted-foreground font-sans mb-0.5">المفتاح المحفوظ</p>
            <code className="text-[11px] font-mono">
              {key.slice(0, 8)}{"•".repeat(Math.min(16, key.length - 8))}
            </code>
          </div>
          <button onClick={clear}
            className="p-1.5 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Test Chat Panel ──────────────────────────────────────────────────────────

function TestChatPanel() {
  const { messages, isStreaming, error, sendMessage, clearMessages } = useChatStream();
  const { data: modelsData } = useGetChatModels({
    query: { queryKey: ["/api/chat/models"], staleTime: 60_000 },
  });
  const models = (modelsData as { models?: { id: string; name: string }[] })?.models ?? [];
  const [model, setModel] = useState("");
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (models.length && !model) setModel(models[0].id);
  }, [models, model]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const submit = () => {
    if (!input.trim() || isStreaming || !model) return;
    sendMessage(input.trim(), model, "");
    setInput("");
  };

  return (
    <div className="flex flex-col h-full border-l border-border/50 bg-card/10">
      {/* Header */}
      <div className="flex-none flex items-center justify-between px-3 py-2 border-b border-border/50">
        <div className="flex items-center gap-1.5">
          <Send className="w-3 h-3 text-primary" />
          <span className="text-[11px] font-medium">Test Chat</span>
        </div>
        <button onClick={clearMessages}
          className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground px-1.5 py-0.5 rounded hover:bg-muted/20 transition-colors">
          clear
        </button>
      </div>

      {/* Model selector */}
      <div className="flex-none px-3 py-2 border-b border-border/30">
        <Select value={model} onValueChange={setModel}>
          <SelectTrigger className="h-7 text-[11px] font-mono">
            <SelectValue placeholder="Select route…" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel className="text-[10px]">Routing Rules</SelectLabel>
              {models.map(m => (
                <SelectItem key={m.id} value={m.id} className="text-[11px] font-mono">{m.id}</SelectItem>
              ))}
              {models.length === 0 && (
                <SelectItem value="__none" disabled className="text-[11px] text-muted-foreground">No routing rules</SelectItem>
              )}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <p className="text-[11px] text-muted-foreground/40 text-center mt-8 font-sans">Send a message to test routing</p>
        )}
        {messages.map(m => (
          <div key={m.id} className={`flex flex-col gap-0.5 ${m.role === "user" ? "items-end" : "items-start"}`}>
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground/40 font-sans px-1">
              {m.role === "user" ? "you" : model}
            </span>
            <div className={`text-[11px] leading-relaxed px-2.5 py-1.5 rounded-lg max-w-[95%] font-sans whitespace-pre-wrap break-words
              ${m.role === "user"
                ? "bg-primary/15 text-foreground"
                : "bg-muted/30 text-foreground"}`}>
              {m.content || (isStreaming && m.role === "assistant" ? <span className="animate-pulse text-muted-foreground">…</span> : "")}
            </div>
          </div>
        ))}
        {error && (
          <div className="text-[11px] text-destructive bg-destructive/10 px-2.5 py-1.5 rounded font-sans">
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-none px-3 py-2 border-t border-border/30">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder="Type a message…"
            disabled={isStreaming || !model}
            className="flex-1 text-[11px] font-sans bg-muted/20 border border-border/50 rounded px-2.5 py-1.5 placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/50 disabled:opacity-40"
          />
          <button onClick={submit} disabled={isStreaming || !input.trim() || !model}
            className="flex-none p-1.5 rounded bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            {isStreaming
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <ArrowUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Console ─────────────────────────────────────────────────────────────

const STATIC_NAV: { id: NavItem; label: string; icon: React.ReactNode }[] = [
  { id: "providers", label: "Providers",   icon: <Globe className="w-3.5 h-3.5" /> },
  { id: "api-keys",  label: "API Keys",    icon: <Key className="w-3.5 h-3.5" /> },
  { id: "routing",   label: "Routing",     icon: <GitBranch className="w-3.5 h-3.5" /> },
];

export default function Console() {
  const { token, logout } = useAdminAuth();
  const { theme, toggleTheme } = useTheme();
  const isAdmin = !!token;
  const [nav, setNav] = useState<NavItem>("providers");
  const [showLogin, setShowLogin] = useState(false);
  const [customProviders, setCustomProviders] = useState<CustomProvider[]>([]);

  const fetchCustomProviders = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/admin/providers", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json() as { providers: CustomProvider[] };
        setCustomProviders(d.providers ?? []);
      }
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => { fetchCustomProviders(); }, [fetchCustomProviders]);

  return (
    <div className="flex flex-col h-screen max-h-screen bg-background text-foreground font-mono overflow-hidden">
      {/* ── Header ── */}
      <header className="flex-none flex items-center justify-between px-4 py-2.5 border-b border-border bg-card/60 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-primary" />
          <span className="font-bold text-sm tracking-tight">CommandCode</span>
          <span className="text-muted-foreground/40 text-xs hidden sm:block">/ API Console</span>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <button onClick={logout}
              className="flex items-center gap-1.5 text-[10px] font-sans text-emerald-500/70 hover:text-emerald-400 transition-colors px-2 py-1 rounded hover:bg-emerald-500/10">
              <Unlock className="w-3 h-3" /> Admin
            </button>
          ) : (
            <button onClick={() => setShowLogin(true)}
              className="flex items-center gap-1.5 text-[10px] font-sans text-muted-foreground/50 hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted/20">
              <Lock className="w-3 h-3" /> Unlock
            </button>
          )}
          <a href="/dashboard" target="_blank"
            className="flex items-center gap-1 text-[10px] font-sans text-muted-foreground/40 hover:text-muted-foreground px-2 py-1 rounded hover:bg-muted/20">
            <ExternalLink className="w-3 h-3" /> Dashboard
          </a>
          <button onClick={toggleTheme}
            className="p-1.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/20 transition-colors"
            title={theme === "dark" ? "وضع الإضاءة" : "الوضع الداكن"}>
            {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
      </header>

      {/* Unlock banner */}
      {!isAdmin && <AdminLockBanner onUnlock={() => setShowLogin(true)} />}

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <nav className="flex-none w-44 border-r border-border/50 bg-card/20 py-3 space-y-0.5 px-2">
          {STATIC_NAV.map(item => (
            <button key={item.id} onClick={() => setNav(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs transition-colors text-left
                ${nav === item.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted/20 hover:text-foreground"}`}>
              {item.icon}
              {item.label}
            </button>
          ))}

          {/* Dynamic nav items for each custom provider */}
          {customProviders.filter(p => p.isActive).map(p => (
            <button key={`custom-${p.slug}`} onClick={() => setNav(`custom-${p.slug}`)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs transition-colors text-left truncate
                ${nav === `custom-${p.slug}`
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted/20 hover:text-foreground"}`}>
              <Key className="w-3.5 h-3.5 flex-none" />
              <span className="truncate">{p.name} Keys</span>
              {localStorage.getItem(`provider_key_${p.slug}`) && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-none ml-auto" />
              )}
            </button>
          ))}

          <div className="pt-2 border-t border-border/30 mt-2">
            <a href="/dashboard/logs" target="_blank"
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs text-muted-foreground hover:bg-muted/20 hover:text-foreground transition-colors">
              <ExternalLink className="w-3.5 h-3.5" />
              Logs
            </a>
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto min-w-0">
          {nav === "providers" && <ProvidersPanel isAdmin={isAdmin} onProvidersChange={fetchCustomProviders} />}
          {nav === "api-keys"  && <ApiKeysPanel  isAdmin={isAdmin} />}
          {nav === "routing"   && <RoutingPanel  isAdmin={isAdmin} customProviders={customProviders} />}
          {customProviders.map(p => nav === `custom-${p.slug}` && (
            <CustomProviderKeyPanel key={p.slug} provider={p} />
          ))}
        </main>

        {/* Test Chat (always visible) */}
        <div className="flex-none w-72 lg:w-80">
          <TestChatPanel />
        </div>
      </div>

      {/* Login dialog */}
      {showLogin && (
        <LoginDialog
          onClose={() => setShowLogin(false)}
          onSuccess={() => setShowLogin(false)}
        />
      )}
    </div>
  );
}

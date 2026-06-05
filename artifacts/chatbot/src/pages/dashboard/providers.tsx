import { useEffect, useState, useCallback } from "react";
import { useAdminFetch } from "@/context/admin-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Trash2, Loader2, ToggleLeft, ToggleRight,
  RefreshCw, Globe, ChevronDown, ChevronUp, X,
  Key, Eye, EyeOff, Copy, CheckCircle2, Search, Pencil,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Channel = {
  prefix: string;
  apiType: "openai" | "openai-responses" | "anthropic" | "gemini";
  displayName: string;
};

type Provider = {
  id: string;
  name: string;
  slug: string;
  baseUrl: string;
  authMethod: string;
  channels: Channel[];
  notes: string | null;
  isActive: boolean;
  createdAt: string;
};

type PoolKeyApiType = "auto" | "openai" | "codex" | "anthropic" | "gemini";
type PoolKey = {
  id: string;
  label: string;
  key: string;
  isActive: boolean;
  apiType?: PoolKeyApiType;
  baseUrl?: string;
};

type FetchedModel = { id: string; owned_by?: string };

const API_TYPE_LABELS: Record<PoolKeyApiType, string> = {
  auto: "Auto",
  openai: "OpenAI (/v1/chat/completions)",
  codex: "Codex (/v1/responses)",
  anthropic: "Anthropic (/v1/messages)",
  gemini: "Gemini (native)",
};

const API_TYPES = ["openai", "openai-responses", "anthropic", "gemini"] as const;
const EMPTY_CHANNEL: Channel = { prefix: "", apiType: "openai", displayName: "" };

// ─── localStorage helpers ─────────────────────────────────────────────────────

function loadPoolKeys(slug: string): PoolKey[] {
  try {
    const raw = localStorage.getItem(`provider_keys_${slug}`);
    if (raw) return JSON.parse(raw) as PoolKey[];
    const legacy = localStorage.getItem(`provider_key_${slug}`);
    if (legacy) {
      const migrated: PoolKey[] = [{ id: crypto.randomUUID(), label: "Key 1", key: legacy, isActive: true }];
      localStorage.setItem(`provider_keys_${slug}`, JSON.stringify(migrated));
      localStorage.removeItem(`provider_key_${slug}`);
      return migrated;
    }
  } catch { /* ignore */ }
  return [];
}

function savePoolKeys(slug: string, keys: PoolKey[]) {
  localStorage.setItem(`provider_keys_${slug}`, JSON.stringify(keys));
}

function maskKey(k: string) {
  if (k.length <= 8) return "••••••••";
  return k.slice(0, 6) + "•".repeat(Math.min(k.length - 9, 20)) + k.slice(-3);
}

// ─── Custom Provider Keys Sub-panel ──────────────────────────────────────────

function ProviderKeysPanel({ provider }: { provider: Provider }) {
  const apiFetch = useAdminFetch();
  const [keys, setKeys] = useState<PoolKey[]>(() => loadPoolKeys(provider.slug));
  const [showForm, setShowForm] = useState(false);
  const [formLabel, setFormLabel] = useState("");
  const [formKey, setFormKey] = useState("");
  const [formApiType, setFormApiType] = useState<PoolKeyApiType>("auto");
  const [formBaseUrl, setFormBaseUrl] = useState("");
  const [showFormKey, setShowFormKey] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState("");

  // Model browsing
  type KeyModels = { keyId: string; keyLabel: string; models: FetchedModel[]; error?: string };
  const [keyModels, setKeyModels] = useState<KeyModels[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelsFetched, setModelsFetched] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [copiedModelId, setCopiedModelId] = useState("");
  const [modelSearch, setModelSearch] = useState("");

  const persist = (next: PoolKey[]) => { setKeys(next); savePoolKeys(provider.slug, next); };

  const addKey = () => {
    if (!formKey.trim()) return;
    const label = formLabel.trim() || `Key ${keys.length + 1}`;
    const trimmedBaseUrl = formBaseUrl.trim();
    persist([...keys, {
      id: crypto.randomUUID(), label, key: formKey.trim(), isActive: true, apiType: formApiType,
      ...(trimmedBaseUrl ? { baseUrl: trimmedBaseUrl } : {}),
    }]);
    setFormLabel(""); setFormKey(""); setFormApiType("auto"); setFormBaseUrl(""); setShowForm(false); setShowFormKey(false);
  };

  const delKey = (id: string) => persist(keys.filter(k => k.id !== id));
  const toggleKey = (id: string) => persist(keys.map(k => k.id === id ? { ...k, isActive: !k.isActive } : k));

  const copyKey = (id: string, val: string) => {
    navigator.clipboard.writeText(val).catch(() => {});
    setCopiedKeyId(id); setTimeout(() => setCopiedKeyId(""), 1500);
  };

  const copyModelId = (id: string) => {
    navigator.clipboard.writeText(id).catch(() => {});
    setCopiedModelId(id); setTimeout(() => setCopiedModelId(""), 1500);
  };

  const fetchModels = async () => {
    const activeKeys = keys.filter(k => k.isActive);
    const keysToTry = activeKeys.length > 0
      ? activeKeys.map(k => ({ id: k.id, label: k.label, key: k.key, baseUrl: k.baseUrl, apiType: k.apiType }))
      : [{ id: "__no-key__", label: "No key", key: "", baseUrl: undefined as string | undefined, apiType: undefined as string | undefined }];
    setFetchingModels(true); setKeyModels([]); setModelsFetched(false);
    const results = await Promise.all(
      keysToTry.map(k =>
        apiFetch("/api/admin/provider-models", {
          method: "POST",
          body: JSON.stringify({ baseUrl: k.baseUrl || provider.baseUrl, apiKey: k.key || undefined, apiType: k.apiType }),
        }).then(async res => {
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
            return { keyId: k.id, keyLabel: k.label, models: [] as FetchedModel[], error: err.error ?? `HTTP ${res.status}` };
          }
          const data = await res.json() as { models: FetchedModel[] };
          return { keyId: k.id, keyLabel: k.label, models: (data.models ?? []).sort((a, b) => a.id.localeCompare(b.id)) };
        }).catch((e: unknown) => ({ keyId: k.id, keyLabel: k.label, models: [] as FetchedModel[], error: String(e).slice(0, 80) }))
      )
    );
    setKeyModels(results);
    setModelsFetched(true);
    if (results.length > 0) setExpandedKey(results[0].keyId);
    setFetchingModels(false);
  };

  const activeCount = keys.filter(k => k.isActive).length;
  const totalModels = keyModels.reduce((n, g) => n + g.models.length, 0);

  return (
    <div className="border-t border-border/30 bg-background/20">
      {/* Keys section */}
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-[9px] text-muted-foreground/60 uppercase tracking-wider flex items-center gap-1.5">
            <Key className="w-3 h-3" /> API Keys
            {keys.length > 0 && (
              <span className="normal-case tracking-normal font-sans text-muted-foreground/40">
                ({activeCount} active / {keys.length} total)
              </span>
            )}
          </label>
          <Button size="sm" variant="outline" className="h-6 px-2 text-[9px] gap-1" onClick={() => setShowForm(v => !v)}>
            <Plus className="w-2.5 h-2.5" /> Add Key
          </Button>
        </div>

        {/* Add key form */}
        {showForm && (
          <div className="border border-border/40 rounded-lg p-3 space-y-2 bg-card/50">
            <Input value={formLabel} onChange={e => setFormLabel(e.target.value)}
              className="h-7 text-xs bg-background/50" placeholder="Label (optional)" />
            <div className="relative">
              <input type={showFormKey ? "text" : "password"} value={formKey}
                onChange={e => setFormKey(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addKey(); }}
                className="w-full h-7 text-xs font-mono bg-background/50 border border-input rounded-md px-3 pr-8 text-foreground outline-none focus:ring-1 focus:ring-ring"
                placeholder={`${provider.name} API key...`} autoFocus />
              <button type="button" onClick={() => setShowFormKey(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground">
                {showFormKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-muted-foreground/50 font-sans w-20 flex-none">API Format</span>
              <select value={formApiType} onChange={e => setFormApiType(e.target.value as PoolKeyApiType)}
                className="flex-1 h-6 rounded border border-border/40 bg-background/60 text-[10px] px-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-primary/50">
                {(Object.entries(API_TYPE_LABELS) as [PoolKeyApiType, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-muted-foreground/50 font-sans w-20 flex-none">Base URL<br /><span className="text-muted-foreground/30">(optional)</span></span>
              <Input value={formBaseUrl} onChange={e => setFormBaseUrl(e.target.value)}
                className="flex-1 h-6 text-[10px] font-mono bg-background/50"
                placeholder={`${provider.baseUrl} (default)`} dir="ltr" />
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" className="h-6 text-[10px]"
                onClick={() => { setShowForm(false); setFormLabel(""); setFormKey(""); setFormApiType("auto"); setFormBaseUrl(""); setShowFormKey(false); }}>
                Cancel
              </Button>
              <Button size="sm" className="h-6 px-2.5 text-[10px]" onClick={addKey} disabled={!formKey.trim()}>Save</Button>
            </div>
          </div>
        )}

        {/* Keys list */}
        {keys.length === 0 ? (
          <p className="text-[10px] text-muted-foreground/40 font-sans py-2 text-center">No keys yet — add one to start using this provider</p>
        ) : (
          <div className="space-y-1">
            {keys.map((k, i) => (
              <div key={k.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded border transition-colors
                ${k.isActive ? "border-border/30 bg-background/30" : "border-border/20 bg-background/10 opacity-50"}`}>
                <span className="text-[9px] text-muted-foreground/30 w-4 text-center">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium">{k.label}</span>
                    {i === 0 && k.isActive && (
                      <span className="text-[8px] uppercase tracking-wider px-1 py-0.5 rounded bg-primary/10 text-primary/70">active</span>
                    )}
                    {k.apiType && k.apiType !== "auto" && (
                      <span className="text-[8px] text-muted-foreground/40 font-mono">{k.apiType}</span>
                    )}
                  </div>
                  <span className="text-[9px] font-mono text-muted-foreground/40">{maskKey(k.key)}</span>
                </div>
                <div className="flex items-center gap-0.5 flex-none">
                  <button onClick={() => copyKey(k.id, k.key)}
                    className="p-1 rounded text-muted-foreground/30 hover:text-foreground hover:bg-muted/20 transition-colors" title="Copy key">
                    {copiedKeyId === k.id ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  </button>
                  <button onClick={() => toggleKey(k.id)}
                    className="p-1 rounded text-muted-foreground/30 hover:text-foreground hover:bg-muted/20 transition-colors">
                    {k.isActive ? <ToggleRight className="w-3.5 h-3.5 text-emerald-500" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => delKey(k.id)}
                    className="p-1 rounded text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Model browser */}
      <div className="px-4 pb-3 space-y-2 border-t border-border/20 pt-3">
        <div className="flex items-center justify-between">
          <label className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">
            Available Models
            {modelsFetched && <span className="ml-1.5 normal-case tracking-normal font-sans text-muted-foreground/40">({totalModels} found)</span>}
          </label>
          <Button size="sm" variant="outline" className="h-6 px-2 text-[9px] gap-1" onClick={fetchModels} disabled={fetchingModels}>
            {fetchingModels ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Search className="w-2.5 h-2.5" />}
            {fetchingModels ? "Fetching…" : "Fetch Models"}
          </Button>
        </div>

        {modelsFetched && keyModels.length > 0 && (
          <div className="space-y-2">
            {totalModels > 5 && (
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/30" />
                <input value={modelSearch} onChange={e => setModelSearch(e.target.value)}
                  placeholder="Search models…"
                  className="w-full h-6 text-[10px] font-mono bg-background/40 border border-border/30 rounded px-6 text-foreground outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/30" />
              </div>
            )}
            {keyModels.map(kr => {
              const isOpen = expandedKey === kr.keyId;
              const hasError = !!kr.error;
              const count = kr.models.length;
              const filtered = modelSearch
                ? kr.models.filter(m => m.id.toLowerCase().includes(modelSearch.toLowerCase()))
                : kr.models;

              return (
                <div key={kr.keyId} className="border border-border/30 rounded-lg overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/10 transition-colors"
                    onClick={() => setExpandedKey(isOpen ? null : kr.keyId)}>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium">{kr.keyLabel}</span>
                      {hasError
                        ? <span className="text-[9px] text-destructive/70 font-sans">Error</span>
                        : <span className="text-[9px] text-muted-foreground/40 font-sans">{count} models</span>}
                    </div>
                    {isOpen ? <ChevronUp className="w-3 h-3 text-muted-foreground/40" /> : <ChevronDown className="w-3 h-3 text-muted-foreground/40" />}
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 border-t border-border/20">
                      {hasError ? (
                        <div className="text-[10px] text-destructive/80 bg-destructive/10 border border-destructive/20 rounded p-2 font-sans mt-2">{kr.error}</div>
                      ) : count === 0 ? (
                        <p className="text-[10px] text-muted-foreground/40 font-sans px-1 py-2">No models found.</p>
                      ) : (
                        <div className="space-y-1 max-h-56 overflow-y-auto pr-0.5 mt-2">
                          {filtered.map(m => (
                            <div key={m.id}
                              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-background/40 border border-border/20 hover:border-border/50 transition-colors group">
                              <span className="text-[10px] font-mono text-foreground/80 truncate">{m.id}</span>
                              <div className="flex items-center gap-2 flex-none">
                                {m.owned_by && (
                                  <span className="text-[9px] text-muted-foreground/30 font-sans hidden group-hover:block">{m.owned_by}</span>
                                )}
                                <button onClick={() => copyModelId(m.id)}
                                  className="text-muted-foreground/30 hover:text-muted-foreground p-0.5 transition-colors">
                                  {copiedModelId === m.id
                                    ? <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                    : <Copy className="w-3 h-3" />}
                                </button>
                              </div>
                            </div>
                          ))}
                          {filtered.length === 0 && modelSearch && (
                            <p className="text-[10px] text-muted-foreground/40 font-sans text-center py-2">No models match "{modelSearch}"</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Providers Page ──────────────────────────────────────────────────────

export default function ProvidersPage() {
  const apiFetch = useAdminFetch();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [authMethod, setAuthMethod] = useState("bearer");
  const [notes, setNotes] = useState("");
  const [channels, setChannels] = useState<Channel[]>([{ ...EMPTY_CHANNEL }]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", baseUrl: "" });
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch("/api/admin/providers");
    const data = (await res.json()) as { providers: Provider[] };
    setProviders(data.providers ?? []);
    setLoading(false);
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setName(""); setSlug(""); setBaseUrl(""); setAuthMethod("bearer");
    setNotes(""); setChannels([{ ...EMPTY_CHANNEL }]); setShowForm(false);
  };

  const addProvider = async () => {
    if (!name.trim() || !slug.trim() || !baseUrl.trim()) return;
    const validChannels = channels.filter((c) => c.prefix.trim() && c.displayName.trim());
    setSaving(true);
    await apiFetch("/api/admin/providers", {
      method: "POST",
      body: JSON.stringify({ name, slug, baseUrl, authMethod, notes, channels: validChannels }),
    });
    resetForm();
    await load();
    setSaving(false);
  };

  const deleteProvider = async (id: string) => {
    await apiFetch(`/api/admin/providers/${id}`, { method: "DELETE" });
    setProviders((prev) => prev.filter((p) => p.id !== id));
  };

  const toggleActive = async (id: string, current: boolean) => {
    await apiFetch(`/api/admin/providers/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !current }),
    });
    setProviders((prev) => prev.map((p) => p.id === id ? { ...p, isActive: !current } : p));
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const updateChannel = (i: number, field: keyof Channel, value: string) => {
    setChannels((prev) => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  };

  const startEdit = (p: Provider) => {
    setEditingId(p.id);
    setEditForm({ name: p.name, baseUrl: p.baseUrl });
    setExpanded((prev) => { const next = new Set(prev); next.delete(p.id); return next; });
  };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = async (id: string) => {
    if (!editForm.name.trim() || !editForm.baseUrl.trim()) return;
    setEditSaving(true);
    await apiFetch(`/api/admin/providers/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: editForm.name.trim(), baseUrl: editForm.baseUrl.trim() }),
    });
    setProviders((prev) => prev.map((p) => p.id === id ? { ...p, name: editForm.name.trim(), baseUrl: editForm.baseUrl.trim() } : p));
    setEditingId(null);
    setEditSaving(false);
  };

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold tracking-tight">Providers</h1>
          <p className="text-[10px] text-muted-foreground font-sans mt-0.5">
            Manage custom AI providers — expand a provider to manage its API keys and browse available models.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load} title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" className="h-7 px-3 text-xs gap-1.5" onClick={() => setShowForm((v) => !v)}>
            <Plus className="w-3.5 h-3.5" />Add Provider
          </Button>
        </div>
      </div>

      {/* Add provider form */}
      {showForm && (
        <div className="border border-border/50 rounded-lg p-4 bg-card/50 space-y-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">New Provider</p>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[9px] text-muted-foreground uppercase tracking-wider">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)}
                className="h-7 text-xs bg-background/50" placeholder="My Provider" />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] text-muted-foreground uppercase tracking-wider">Slug (unique ID)</label>
              <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                className="h-7 text-xs font-mono bg-background/50" placeholder="my-provider" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[9px] text-muted-foreground uppercase tracking-wider">Base URL</label>
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
                className="h-7 text-xs font-mono bg-background/50" placeholder="https://api.example.com" />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] text-muted-foreground uppercase tracking-wider">Auth Method</label>
              <select value={authMethod} onChange={(e) => setAuthMethod(e.target.value)}
                className="h-7 w-full text-xs bg-background/50 border border-input rounded-md px-2 text-foreground">
                <option value="bearer">Bearer Token</option>
                <option value="x-api-key">X-Api-Key Header</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] text-muted-foreground uppercase tracking-wider">Notes (optional)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)}
              className="h-7 text-xs bg-background/50" placeholder="e.g. requires CLI protocol headers" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[9px] text-muted-foreground uppercase tracking-wider">Channels</label>
              <button onClick={() => setChannels((prev) => [...prev, { ...EMPTY_CHANNEL }])}
                className="text-[9px] text-primary/70 hover:text-primary flex items-center gap-1">
                <Plus className="w-2.5 h-2.5" />Add channel
              </button>
            </div>
            {channels.map((ch, i) => (
              <div key={i} className="flex items-center gap-2 bg-background/30 rounded p-2 border border-border/30">
                <Input value={ch.prefix} onChange={(e) => updateChannel(i, "prefix", e.target.value)}
                  className="h-6 text-[10px] font-mono bg-transparent border-0 p-0 px-1 flex-[0_0_110px]" placeholder="/channel-prefix" />
                <select value={ch.apiType} onChange={(e) => updateChannel(i, "apiType", e.target.value)}
                  className="h-6 text-[10px] bg-background/50 border border-input rounded px-1 text-foreground flex-[0_0_140px]">
                  {API_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <Input value={ch.displayName} onChange={(e) => updateChannel(i, "displayName", e.target.value)}
                  className="h-6 text-[10px] bg-transparent border-0 p-0 px-1 flex-1" placeholder="Display name" />
                {channels.length > 1 && (
                  <button onClick={() => setChannels((prev) => prev.filter((_, j) => j !== i))}
                    className="text-muted-foreground/40 hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={resetForm}>Cancel</Button>
            <Button size="sm" className="h-7 px-3 text-xs" onClick={addProvider}
              disabled={saving || !name.trim() || !slug.trim() || !baseUrl.trim()}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add Provider"}
            </Button>
          </div>
        </div>
      )}

      {/* Providers list */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : providers.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground space-y-2">
          <Globe className="w-8 h-8 mx-auto opacity-20" />
          <p className="text-xs">No custom providers</p>
          <p className="text-[10px] font-sans text-muted-foreground/50">Add providers to route chat requests to additional APIs</p>
        </div>
      ) : (
        <div className="space-y-2">
          {providers.map((p) => {
            const isExpanded = expanded.has(p.id);
            const isEditing = editingId === p.id;
            const savedKeyCount = loadPoolKeys(p.slug).length;
            return (
              <div key={p.id} className={`border rounded-lg transition-colors overflow-hidden
                ${p.isActive ? "border-border/50 bg-card/30" : "border-border/30 bg-card/10 opacity-60"}`}>

                {/* Inline edit form */}
                {isEditing ? (
                  <div className="p-3 space-y-2">
                    <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest">Edit Provider</p>
                    <Input value={editForm.name}
                      onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      className="h-7 text-xs bg-background/50" placeholder="Name" autoFocus />
                    <Input value={editForm.baseUrl}
                      onChange={e => setEditForm(f => ({ ...f, baseUrl: e.target.value }))}
                      className="h-7 text-xs font-mono bg-background/50" placeholder="https://api.example.com" />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={cancelEdit}>Cancel</Button>
                      <Button size="sm" className="h-6 px-3 text-xs" onClick={() => saveEdit(p.id)} disabled={editSaving}>
                        {editSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Provider row */
                  <div className="flex items-center gap-3 p-3">
                    <Globe className="w-4 h-4 text-muted-foreground/50 flex-none" />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium">{p.name}</span>
                        <span className="text-[9px] font-mono text-muted-foreground/50 bg-muted/20 px-1.5 py-0.5 rounded">{p.slug}</span>
                        {!p.isActive && <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-muted/40 text-muted-foreground">disabled</span>}
                        {savedKeyCount > 0 && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                            <Key className="w-2.5 h-2.5" />{savedKeyCount} key{savedKeyCount !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">{p.baseUrl}</div>
                      {p.notes && <div className="text-[10px] text-muted-foreground/50 font-sans mt-0.5">{p.notes}</div>}
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50 font-sans flex-none">
                      <span>{p.channels.length} ch</span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-none">
                      <button onClick={() => toggleExpand(p.id)}
                        className="p-1.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/20 transition-colors"
                        title={isExpanded ? "Collapse" : "Expand — manage keys"}>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => startEdit(p)}
                        className="p-1.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/20 transition-colors" title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => toggleActive(p.id, p.isActive)}
                        className="p-1.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/20 transition-colors">
                        {p.isActive ? <ToggleRight className="w-3.5 h-3.5 text-emerald-500" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => deleteProvider(p.id)}
                        className="p-1.5 rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Channels sub-section */}
                {isExpanded && p.channels.length > 0 && (
                  <div className="px-4 pb-2 border-t border-border/20">
                    <p className="text-[9px] text-muted-foreground/40 uppercase tracking-widest py-2">Channels</p>
                    <div className="space-y-1">
                      {p.channels.map((ch, i) => (
                        <div key={i} className="flex items-center gap-3 text-[10px] bg-background/30 rounded px-2.5 py-1.5">
                          <span className="font-mono text-primary/70 w-32 flex-none">{ch.prefix}</span>
                          <span className="bg-muted/30 px-1.5 py-0.5 rounded text-muted-foreground w-32 flex-none">{ch.apiType}</span>
                          <span className="text-muted-foreground font-sans">{ch.displayName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* API Keys + Model browser */}
                {isExpanded && <ProviderKeysPanel provider={p} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

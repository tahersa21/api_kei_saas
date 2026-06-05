import { useState, useEffect, useCallback, useRef } from "react";
import { useAdminAuth, useAdminFetch } from "@/context/admin-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Loader2, ToggleLeft, ToggleRight, RefreshCw,
  GitBranch, ArrowUp, ArrowDown, Copy, CheckCircle2,
  Pencil, Trash2, X, SquareSquare,
} from "lucide-react";

type RoutingProviderEntry = {
  providerType: "cc" | "rc" | "ag" | "custom";
  providerId?: string;
  modelId: string;
  rpmLimit: number;
  priority: number;
  apiKey?: string;
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

type CustomProvider = {
  id: string; name: string; slug: string; type: string;
  baseUrl: string; authMethod: string; isActive: boolean;
  channels: { prefix: string; apiType: string; displayName: string }[];
  notes: string | null; createdAt: string;
};

type PoolKey = { id: string; label: string; key: string; isActive: boolean; apiType?: string; baseUrl?: string };

const PROVIDER_TYPE_LABELS: Record<string, string> = {
  cc: "CommandCode", rc: "Right Code", ag: "AiGoCode", custom: "Custom",
};
const PROVIDER_TYPE_COLORS: Record<string, string> = {
  cc: "text-emerald-400", rc: "text-blue-400", ag: "text-violet-400", custom: "text-amber-400",
};

function loadPoolKeys(slug: string): PoolKey[] {
  try {
    const raw = localStorage.getItem(`provider_keys_${slug}`);
    if (raw) return JSON.parse(raw) as PoolKey[];
    const legacy = localStorage.getItem(`provider_key_${slug}`);
    if (legacy) return [{ id: crypto.randomUUID(), label: "Key 1", key: legacy, isActive: true }];
  } catch { /* ignore */ }
  return [];
}

function RoutingProviderRow({
  entry, index, total, customProviders, adminToken,
  onChange, onRemove, onMoveUp, onMoveDown,
}: {
  entry: RoutingProviderEntry; index: number; total: number;
  customProviders: CustomProvider[]; adminToken: string | null;
  onChange: (e: RoutingProviderEntry) => void;
  onRemove: () => void; onMoveUp: () => void; onMoveDown: () => void;
}) {
  const [browsedModels, setBrowsedModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [browseError, setBrowseError] = useState("");
  const [poolKeys, setPoolKeys] = useState<PoolKey[]>([]);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (entry.providerType !== "custom" || !entry.providerId) { setPoolKeys([]); return; }
    setPoolKeys(loadPoolKeys(entry.providerId).filter(k => k.isActive));
  }, [entry.providerType, entry.providerId]);

  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPicker]);

  const browseModels = async () => {
    setFetchingModels(true); setBrowseError(""); setBrowsedModels([]); setShowPicker(false);
    try {
      let ids: string[] = [];
      if (entry.providerType === "cc") {
        const r = await fetch("/api/chat/models");
        if (r.ok) { const d = await r.json() as { models: (string | { id: string })[] }; ids = d.models.map(m => typeof m === "string" ? m : m.id); }
      } else if (entry.providerType === "rc") {
        const r = await fetch("/api/chat/rc-models");
        if (r.ok) { const d = await r.json() as { models: { id: string }[] }; ids = d.models.map(m => m.id); }
      } else if (entry.providerType === "custom" && entry.providerId) {
        const provider = customProviders.find(p => p.slug === entry.providerId);
        if (provider && adminToken) {
          const r = await fetch("/api/admin/provider-models", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
            body: JSON.stringify({ baseUrl: entry.apiBaseUrl || provider.baseUrl, apiKey: entry.apiKey }),
          });
          if (r.ok) { const d = await r.json() as { models: { id: string }[] }; ids = d.models.map(m => m.id).sort(); }
        }
      } else {
        setBrowseError("Provider type not supported for model browsing");
      }
      setBrowsedModels(ids);
      if (ids.length > 0) setShowPicker(true);
      else if (!browseError) setBrowseError("No models found");
    } catch (e) { setBrowseError(String(e).slice(0, 80)); }
    finally { setFetchingModels(false); }
  };

  const selectVal = entry.providerType === "custom" ? (entry.providerId ?? "__custom__") : entry.providerType;

  const handleProviderChange = (val: string) => {
    const builtin = ["cc", "rc", "ag"];
    if (builtin.includes(val)) {
      onChange({ ...entry, providerType: val as "cc" | "rc" | "ag", providerId: undefined, modelId: "", apiKey: undefined, apiBaseUrl: undefined });
    } else {
      onChange({ ...entry, providerType: "custom", providerId: val, modelId: "", apiKey: undefined, apiBaseUrl: undefined });
    }
    setBrowsedModels([]); setShowPicker(false); setBrowseError("");
  };

  const selectedKeyId = entry.apiKey ? (poolKeys.find(k => k.key === entry.apiKey)?.id ?? "__unknown__") : "__any__";

  const modelPlaceholder = entry.providerType === "rc" ? "rc:/codex-pro|gpt-5" : entry.providerType === "ag" ? "ag:gpt-4o" : "zai-org/GLM-5";

  return (
    <div className="flex items-start gap-2 p-2.5 rounded-lg border border-border/30 bg-background/40">
      {/* Up/Down */}
      <div className="flex flex-col gap-0.5 pt-1">
        <button onClick={onMoveUp} disabled={index === 0}
          className="p-0.5 rounded text-muted-foreground/30 hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed">
          <ArrowUp className="w-3 h-3" />
        </button>
        <button onClick={onMoveDown} disabled={index === total - 1}
          className="p-0.5 rounded text-muted-foreground/30 hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed">
          <ArrowDown className="w-3 h-3" />
        </button>
      </div>

      <div className="flex-1 space-y-2 min-w-0">
        {/* Provider */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground/40 w-16 flex-none">Provider</span>
          <select value={selectVal} onChange={e => handleProviderChange(e.target.value)}
            className="flex-1 h-7 rounded-md border border-border/40 bg-background/60 text-xs px-2 font-mono focus:outline-none focus:ring-1 focus:ring-primary/50">
            <optgroup label="Built-in">
              <option value="cc">CommandCode (CC)</option>
              <option value="rc">Right Code (RC)</option>
              <option value="ag">AiGoCode (AG)</option>
            </optgroup>
            {customProviders.length > 0 && (
              <optgroup label="Custom">
                {customProviders.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
              </optgroup>
            )}
          </select>
        </div>

        {/* Key picker for custom */}
        {entry.providerType === "custom" && entry.providerId && poolKeys.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground/40 w-16 flex-none">Key</span>
            <select value={selectedKeyId} onChange={e => {
              const k = poolKeys.find(pk => pk.id === e.target.value);
              onChange({ ...entry, apiKey: k?.key, apiBaseUrl: k?.baseUrl });
            }} className="flex-1 h-7 rounded-md border border-border/40 bg-background/60 text-xs px-2 font-mono focus:outline-none focus:ring-1 focus:ring-primary/50">
              <option value="__any__">— Any key (round-robin) —</option>
              {poolKeys.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </div>
        )}

        {/* Model ID */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground/40 w-16 flex-none">Model</span>
          <div className="flex-1 relative" ref={pickerRef}>
            <Input value={entry.modelId} onChange={e => onChange({ ...entry, modelId: e.target.value })}
              placeholder={modelPlaceholder}
              className="h-7 text-xs font-mono bg-background/60 pr-20" />
            <button onClick={browseModels} disabled={fetchingModels}
              className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 h-5 rounded text-[9px] text-muted-foreground/50 hover:text-primary/70 hover:bg-primary/10 disabled:opacity-40 transition-colors font-sans">
              {fetchingModels ? <Loader2 className="w-3 h-3 animate-spin" /> : <SquareSquare className="w-3 h-3" />}
              Browse
            </button>
            {showPicker && browsedModels.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-52 overflow-y-auto rounded-lg border border-border/50 bg-card shadow-xl">
                <div className="px-2 py-1 border-b border-border/20 flex items-center justify-between sticky top-0 bg-card z-10">
                  <span className="text-[9px] text-muted-foreground/40 font-sans">{browsedModels.length} models</span>
                  <button onClick={() => setShowPicker(false)} className="text-muted-foreground/30 hover:text-foreground"><X className="w-3 h-3" /></button>
                </div>
                {browsedModels.map(m => (
                  <button key={m} className="w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-primary/10 hover:text-primary transition-colors truncate"
                    onClick={() => { onChange({ ...entry, modelId: m }); setShowPicker(false); }}>
                    {m}
                  </button>
                ))}
              </div>
            )}
            {browseError && !showPicker && (
              <p className="absolute top-full left-0 mt-1 text-[9px] text-destructive/70 font-sans whitespace-nowrap">{browseError}</p>
            )}
          </div>
        </div>

        {/* RPM */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground/40 w-16 flex-none">RPM</span>
          <Input type="number" min={0} value={entry.rpmLimit}
            onChange={e => onChange({ ...entry, rpmLimit: Math.max(0, Number(e.target.value)) })}
            placeholder="0 = unlimited" className="h-7 text-xs font-mono bg-background/60 flex-1" />
        </div>
      </div>

      <button onClick={onRemove} className="p-1 rounded text-muted-foreground/20 hover:text-destructive/70 transition-colors mt-0.5 flex-none">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function RuleEditor({
  rule, customProviders, adminToken, onSave, onCancel,
}: {
  rule: Partial<RoutingRule> & { providers: RoutingProviderEntry[] };
  customProviders: CustomProvider[];
  adminToken: string | null;
  onSave: (data: { name: string; description: string; providers: RoutingProviderEntry[]; isActive: boolean }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(rule.name ?? "");
  const [description, setDescription] = useState(rule.description ?? "");
  const [providers, setProviders] = useState<RoutingProviderEntry[]>(rule.providers);
  const [isActive, setIsActive] = useState(rule.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const addProvider = () =>
    setProviders(prev => [...prev, { providerType: "cc", modelId: "", rpmLimit: 0, priority: prev.length }]);

  const handleSave = async () => {
    if (!name.trim()) { setErr("Name is required"); return; }
    setSaving(true); setErr("");
    try { await onSave({ name: name.trim(), description, providers, isActive }); }
    catch (e) { setErr(String(e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Rule Name</label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. fast, smart, fallback"
            className="h-8 text-sm font-mono bg-background/60" />
          <p className="text-[9px] text-muted-foreground/40 font-sans">
            Use as: <span className="font-mono text-primary/50">route:{name || "name"}</span>
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Description</label>
          <Input value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Optional" className="h-8 text-sm bg-background/60" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Active</label>
        <button onClick={() => setIsActive(v => !v)}>
          {isActive
            ? <ToggleRight className="w-6 h-6 text-emerald-500" />
            : <ToggleLeft className="w-6 h-6 text-muted-foreground/40" />}
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wider flex items-center gap-1.5">
            <GitBranch className="w-3 h-3" /> Provider Chain (top = highest priority)
          </label>
          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1" onClick={addProvider}>
            <Plus className="w-3 h-3" /> Add
          </Button>
        </div>

        {providers.length === 0 && (
          <div className="text-[10px] text-muted-foreground/30 font-sans text-center py-4 border border-dashed border-border/30 rounded-lg">
            No providers — add at least one
          </div>
        )}

        <div className="space-y-2">
          {providers.map((entry, i) => (
            <RoutingProviderRow key={i} entry={entry} index={i} total={providers.length}
              customProviders={customProviders} adminToken={adminToken}
              onChange={e => setProviders(prev => prev.map((p, idx) => idx === i ? e : p))}
              onRemove={() => setProviders(prev => prev.filter((_, idx) => idx !== i).map((p, idx) => ({ ...p, priority: idx })))}
              onMoveUp={() => {
                if (i === 0) return;
                const next = [...providers]; [next[i], next[i - 1]] = [next[i - 1], next[i]];
                setProviders(next.map((p, idx) => ({ ...p, priority: idx })));
              }}
              onMoveDown={() => {
                if (i === providers.length - 1) return;
                const next = [...providers]; [next[i], next[i + 1]] = [next[i + 1], next[i]];
                setProviders(next.map((p, idx) => ({ ...p, priority: idx })));
              }}
            />
          ))}
        </div>
      </div>

      {err && <p className="text-xs text-destructive font-sans">{err}</p>}

      <div className="flex items-center gap-2 pt-1">
        <Button className="h-8 text-xs gap-1.5" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          Save Rule
        </Button>
        <Button variant="outline" className="h-8 text-xs" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

export default function RoutingPage() {
  const { token } = useAdminAuth();
  const adminFetch = useAdminFetch();
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [rpmStats, setRpmStats] = useState<Record<string, number>>({});
  const [customProviders, setCustomProviders] = useState<CustomProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rr, pr] = await Promise.all([
        adminFetch("/api/admin/routing-rules"),
        adminFetch("/api/admin/providers"),
      ]);
      if (rr.ok) {
        const d = await rr.json() as { rules: RoutingRule[]; rpmStats: Record<string, number> };
        setRules(d.rules ?? []); setRpmStats(d.rpmStats ?? {});
      }
      if (pr.ok) {
        const d = await pr.json() as { providers: CustomProvider[] };
        setCustomProviders(d.providers ?? []);
      }
    } finally { setLoading(false); }
  }, [adminFetch]);

  useEffect(() => { load(); }, [load]);

  const copyRouteId = (name: string) => {
    navigator.clipboard.writeText(`route:${name}`).catch(() => {});
    setCopiedId(name); setTimeout(() => setCopiedId(null), 1500);
  };

  const toggleActive = async (rule: RoutingRule) => {
    await adminFetch(`/api/admin/routing-rules/${rule.id}`, {
      method: "PATCH", body: JSON.stringify({ isActive: !rule.isActive }),
    });
    await load();
  };

  const deleteRule = async (id: string) => {
    if (!confirm("Delete this routing rule?")) return;
    await adminFetch(`/api/admin/routing-rules/${id}`, { method: "DELETE" });
    await load();
  };

  const saveNew = async (data: { name: string; description: string; providers: RoutingProviderEntry[]; isActive: boolean }) => {
    const r = await adminFetch("/api/admin/routing-rules", {
      method: "POST", body: JSON.stringify(data),
    });
    if (!r.ok) { const d = await r.json() as { error?: string }; throw new Error(d.error ?? "Failed"); }
    setCreating(false); await load();
  };

  const saveEdit = async (id: string, data: { name: string; description: string; providers: RoutingProviderEntry[]; isActive: boolean }) => {
    const r = await adminFetch(`/api/admin/routing-rules/${id}`, {
      method: "PATCH", body: JSON.stringify(data),
    });
    if (!r.ok) { const d = await r.json() as { error?: string }; throw new Error(d.error ?? "Failed"); }
    setEditingId(null); await load();
  };

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold tracking-tight flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-primary" />Smart Routing
          </h1>
          <p className="text-[10px] text-muted-foreground font-sans mt-0.5">Priority failover chains — use <code className="font-mono">route:&lt;name&gt;</code> as the model ID</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" className="h-7 px-3 text-xs gap-1.5"
            onClick={() => { setCreating(true); setEditingId(null); }}>
            <Plus className="w-3.5 h-3.5" /> New Rule
          </Button>
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground/50 font-sans bg-muted/10 border border-border/20 rounded-lg px-3 py-2 leading-relaxed">
        The engine tries providers top-down, skipping any that exceed their RPM limit. Fallback happens automatically.
      </div>

      {creating && (
        <div className="border border-primary/20 rounded-xl bg-card/30 p-4 space-y-3">
          <p className="text-xs font-bold text-primary/70">New Routing Rule</p>
          <RuleEditor rule={{ providers: [], isActive: true }} customProviders={customProviders}
            adminToken={token} onSave={saveNew} onCancel={() => setCreating(false)} />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-primary/40" />
        </div>
      ) : rules.length === 0 && !creating ? (
        <div className="text-center py-16 text-xs text-muted-foreground/30 font-sans">
          No routing rules yet. Click "New Rule" to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => (
            <div key={rule.id} className={`border rounded-xl bg-card/20 overflow-hidden transition-colors ${rule.isActive ? "border-border/40" : "border-border/20 opacity-60"}`}>
              {editingId === rule.id ? (
                <div className="p-4 space-y-3">
                  <p className="text-xs font-bold text-primary/70">Edit Rule</p>
                  <RuleEditor rule={rule} customProviders={customProviders} adminToken={token}
                    onSave={(data) => saveEdit(rule.id, data)} onCancel={() => setEditingId(null)} />
                </div>
              ) : (
                <div className="px-4 py-3 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <button onClick={() => toggleActive(rule)}>
                        {rule.isActive
                          ? <ToggleRight className="w-5 h-5 text-emerald-500 flex-none" />
                          : <ToggleLeft className="w-5 h-5 text-muted-foreground/30 flex-none" />}
                      </button>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold truncate">{rule.name}</span>
                          {!rule.isActive && (
                            <span className="text-[9px] uppercase tracking-wider text-muted-foreground/40 bg-muted/20 px-1.5 py-0.5 rounded flex-none">disabled</span>
                          )}
                        </div>
                        {rule.description && (
                          <p className="text-[10px] text-muted-foreground/50 font-sans truncate">{rule.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-none">
                      <button onClick={() => copyRouteId(rule.name)}
                        className="flex items-center gap-1 text-[9px] font-mono text-primary/40 hover:text-primary/70 bg-primary/5 hover:bg-primary/10 px-2 py-1 rounded transition-colors">
                        {copiedId === rule.name
                          ? <><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Copied</>
                          : <><Copy className="w-3 h-3" /> route:{rule.name}</>}
                      </button>
                      <button onClick={() => { setEditingId(rule.id); setCreating(false); }}
                        className="p-1.5 rounded text-muted-foreground/30 hover:text-foreground hover:bg-muted/20 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteRule(rule.id)}
                        className="p-1.5 rounded text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {rule.providers.length > 0 && (
                    <div className="pl-7 space-y-1">
                      {rule.providers.map((p, i) => {
                        const currentRpm = rpmStats[`${rule.id}:${i}`] ?? 0;
                        const overLimit = p.rpmLimit > 0 && currentRpm >= p.rpmLimit;
                        return (
                          <div key={i} className="flex items-center gap-2 text-[10px] font-sans">
                            <span className="text-[8px] text-muted-foreground/40">#{i + 1}</span>
                            <span className={`font-bold ${PROVIDER_TYPE_COLORS[p.providerType]}`}>{PROVIDER_TYPE_LABELS[p.providerType]}</span>
                            <span className="text-foreground/60 font-mono truncate">{p.modelId || "—"}</span>
                            {p.rpmLimit > 0 && (
                              <span className={overLimit ? "text-destructive/60" : "text-muted-foreground/30"}>
                                {currentRpm}/{p.rpmLimit} rpm
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

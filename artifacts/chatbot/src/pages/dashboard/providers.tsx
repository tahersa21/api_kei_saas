import { useEffect, useState, useCallback } from "react";
import { useAdminFetch } from "@/context/admin-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Trash2, Loader2, ToggleLeft, ToggleRight,
  RefreshCw, Globe, ChevronDown, ChevronUp, X,
} from "lucide-react";

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

const API_TYPES = ["openai", "openai-responses", "anthropic", "gemini"] as const;

const EMPTY_CHANNEL: Channel = { prefix: "", apiType: "openai", displayName: "" };

export default function ProvidersPage() {
  const apiFetch = useAdminFetch();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [authMethod, setAuthMethod] = useState("bearer");
  const [notes, setNotes] = useState("");
  const [channels, setChannels] = useState<Channel[]>([{ ...EMPTY_CHANNEL }]);

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

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold tracking-tight">Providers</h1>
          <p className="text-[10px] text-muted-foreground font-sans mt-0.5">
            Manage custom AI providers. Each provider can have multiple channels with different API formats.
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
            return (
              <div key={p.id} className={`border rounded-lg transition-colors
                ${p.isActive ? "border-border/50 bg-card/30" : "border-border/30 bg-card/10 opacity-60"}`}>
                <div className="flex items-center gap-3 p-3">
                  <Globe className="w-4 h-4 text-muted-foreground/50 flex-none" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{p.name}</span>
                      <span className="text-[9px] font-mono text-muted-foreground/50 bg-muted/20 px-1.5 py-0.5 rounded">{p.slug}</span>
                      {!p.isActive && <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-muted/40 text-muted-foreground">disabled</span>}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{p.baseUrl}</div>
                    {p.notes && <div className="text-[10px] text-muted-foreground/50 font-sans mt-0.5">{p.notes}</div>}
                  </div>

                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50 font-sans flex-none">
                    <span>{p.channels.length} channel{p.channels.length !== 1 ? "s" : ""}</span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-none">
                    <button onClick={() => toggleExpand(p.id)}
                      className="p-1.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/20 transition-colors">
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
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

                {isExpanded && p.channels.length > 0 && (
                  <div className="px-3 pb-3 border-t border-border/30">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-widest py-2">Channels</p>
                    <div className="space-y-1">
                      {p.channels.map((ch, i) => (
                        <div key={i} className="flex items-center gap-3 text-[10px] bg-background/30 rounded px-2 py-1.5">
                          <span className="font-mono text-primary/70 w-32 flex-none">{ch.prefix}</span>
                          <span className="bg-muted/30 px-1.5 py-0.5 rounded text-muted-foreground w-32 flex-none">{ch.apiType}</span>
                          <span className="text-muted-foreground font-sans">{ch.displayName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

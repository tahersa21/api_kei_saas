import { useEffect, useState, useCallback } from "react";
import { useAdminFetch } from "@/context/admin-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Trash2, PlayCircle, CheckCircle2, XCircle, Loader2,
  ToggleLeft, ToggleRight, RefreshCw,
} from "lucide-react";

type CcKey = {
  id: string;
  label: string;
  key: string;
  isActive: boolean;
  isValid: boolean;
  usageCount: number;
  lastUsedAt: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
};

export default function CcKeysPage() {
  const apiFetch = useAdminFetch();
  const [keys, setKeys] = useState<CcKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [newKey, setNewKey] = useState("");
  const [adding, setAdding] = useState(false);
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/admin/cc-keys");
    const data = (await res.json()) as { keys: CcKey[] };
    setKeys(data.keys ?? []);
    setLoading(false);
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  const addKey = async () => {
    if (!newKey.trim()) return;
    setAdding(true);
    await apiFetch("/api/admin/cc-keys", {
      method: "POST",
      body: JSON.stringify({ label: newLabel, key: newKey }),
    });
    setNewLabel(""); setNewKey(""); setShowForm(false);
    await load();
    setAdding(false);
  };

  const deleteKey = async (id: string) => {
    await apiFetch(`/api/admin/cc-keys/${id}`, { method: "DELETE" });
    setKeys((prev) => prev.filter((k) => k.id !== id));
  };

  const toggleActive = async (id: string, current: boolean) => {
    await apiFetch(`/api/admin/cc-keys/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !current }),
    });
    setKeys((prev) => prev.map((k) => k.id === id ? { ...k, isActive: !current } : k));
  };

  const testKey = async (id: string) => {
    setTesting((prev) => ({ ...prev, [id]: true }));
    const res = await apiFetch(`/api/admin/cc-keys/${id}/test`, { method: "POST" });
    const result = (await res.json()) as { ok: boolean; message: string };
    setTestResults((prev) => ({ ...prev, [id]: result }));
    setTesting((prev) => ({ ...prev, [id]: false }));
    setKeys((prev) => prev.map((k) => k.id === id ? { ...k, isValid: result.ok } : k));
  };

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold tracking-tight">CommandCode Keys</h1>
          <p className="text-[10px] text-muted-foreground font-sans mt-0.5">Pool of CC API keys — requests are distributed in round-robin</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load} title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" className="h-7 px-3 text-xs gap-1.5" onClick={() => setShowForm((v) => !v)}>
            <Plus className="w-3.5 h-3.5" />Add Key
          </Button>
        </div>
      </div>

      {showForm && (
        <div className="border border-border/50 rounded-lg p-4 bg-card/50 space-y-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Add CommandCode API Key</p>
          <div className="flex gap-2">
            <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
              className="h-8 text-xs font-sans bg-background/50 flex-[0_0_160px]" placeholder="Label (e.g. Main)" />
            <Input value={newKey} onChange={(e) => setNewKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addKey(); }}
              className="h-8 text-xs font-mono bg-background/50 flex-1" placeholder="cc-..." />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setShowForm(false); setNewLabel(""); setNewKey(""); }}>Cancel</Button>
            <Button size="sm" className="h-7 px-3 text-xs" onClick={addKey} disabled={adding || !newKey.trim()}>
              {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add"}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : keys.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground space-y-2">
          <p className="text-xs">No CC keys added yet</p>
          <p className="text-[10px] font-sans text-muted-foreground/50">Add your CommandCode API keys to the pool</p>
        </div>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => (
            <div key={k.id} className={`border rounded-lg p-3 flex items-center gap-3 transition-colors
              ${k.isActive && k.isValid ? "border-border/50 bg-card/30" : "border-border/30 bg-card/10 opacity-60"}`}>
              <div className="flex-none">
                {k.isValid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-destructive" />
                )}
              </div>

              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{k.label}</span>
                  {!k.isActive && <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-muted/40 text-muted-foreground">disabled</span>}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-sans">
                  <span className="font-mono">{k.key}</span>
                  <span>•</span>
                  <span>{k.usageCount.toLocaleString()} requests</span>
                  {k.lastUsedAt && <><span>•</span><span>last used {new Date(k.lastUsedAt).toLocaleDateString()}</span></>}
                </div>
                {testResults[k.id] && (
                  <p className={`text-[10px] font-sans ${testResults[k.id].ok ? "text-emerald-500" : "text-destructive"}`}>
                    {testResults[k.id].message}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-none">
                <button onClick={() => testKey(k.id)} disabled={testing[k.id]}
                  title="Test connection"
                  className="p-1.5 rounded text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors">
                  {testing[k.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => toggleActive(k.id, k.isActive)}
                  title={k.isActive ? "Disable" : "Enable"}
                  className="p-1.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/20 transition-colors">
                  {k.isActive ? <ToggleRight className="w-3.5 h-3.5 text-emerald-500" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => deleteKey(k.id)}
                  title="Delete"
                  className="p-1.5 rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors">
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

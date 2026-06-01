import { useEffect, useState, useCallback } from "react";
import { useAdminFetch } from "@/context/admin-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Trash2, CheckCircle2, XCircle, Loader2,
  ToggleLeft, ToggleRight, RefreshCw, Server,
} from "lucide-react";

type RcKey = {
  id: string;
  label: string;
  key: string;
  isActive: boolean;
  isValid: boolean;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
};

export default function RcKeysPage() {
  const apiFetch = useAdminFetch();
  const [keys, setKeys] = useState<RcKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [newKey, setNewKey] = useState("");
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch("/api/admin/rc-keys");
    const data = (await res.json()) as { keys: RcKey[] };
    setKeys(data.keys ?? []);
    setLoading(false);
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  const addKey = async () => {
    if (!newKey.trim()) return;
    setAdding(true);
    await apiFetch("/api/admin/rc-keys", {
      method: "POST",
      body: JSON.stringify({ label: newLabel, key: newKey }),
    });
    setNewLabel(""); setNewKey(""); setShowForm(false);
    await load();
    setAdding(false);
  };

  const deleteKey = async (id: string) => {
    await apiFetch(`/api/admin/rc-keys/${id}`, { method: "DELETE" });
    setKeys((prev) => prev.filter((k) => k.id !== id));
  };

  const toggleActive = async (id: string, current: boolean) => {
    await apiFetch(`/api/admin/rc-keys/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !current }),
    });
    setKeys((prev) => prev.map((k) => k.id === id ? { ...k, isActive: !current } : k));
  };

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold tracking-tight">Right Code Keys</h1>
          <p className="text-[10px] text-muted-foreground font-sans mt-0.5">
            Pool of right.codes API keys — distributed round-robin. If a user sends their own key, it takes priority.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load} title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" className="h-7 px-3 text-xs gap-1.5 bg-violet-600 hover:bg-violet-500" onClick={() => setShowForm((v) => !v)}>
            <Plus className="w-3.5 h-3.5" />Add Key
          </Button>
        </div>
      </div>

      {showForm && (
        <div className="border border-violet-500/30 rounded-lg p-4 bg-violet-500/5 space-y-3">
          <p className="text-[10px] text-violet-400/70 uppercase tracking-widest">Add Right Code API Key</p>
          <div className="flex gap-2">
            <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
              className="h-8 text-xs font-sans bg-background/50 flex-[0_0_160px]" placeholder="Label (e.g. Pool-1)" />
            <Input value={newKey} onChange={(e) => setNewKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addKey(); }}
              className="h-8 text-xs font-mono bg-background/50 flex-1" placeholder="rc-..." />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setShowForm(false); setNewLabel(""); setNewKey(""); }}>Cancel</Button>
            <Button size="sm" className="h-7 px-3 text-xs bg-violet-600 hover:bg-violet-500" onClick={addKey} disabled={adding || !newKey.trim()}>
              {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add"}
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 text-[10px] text-violet-400/70 font-sans space-y-1">
        <p className="font-semibold">How RC key pooling works:</p>
        <ul className="list-disc list-inside space-y-0.5 text-violet-400/50">
          <li>If the user provides their own RC key, it is used directly (existing behaviour).</li>
          <li>If no user key is present, the server selects the next valid pool key (round-robin).</li>
          <li>Add multiple keys below to spread load across right.codes API quotas.</li>
        </ul>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : keys.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground space-y-2">
          <Server className="w-8 h-8 mx-auto opacity-20" />
          <p className="text-xs">No RC keys added yet</p>
          <p className="text-[10px] font-sans text-muted-foreground/50">Add right.codes API keys to enable server-side pooling</p>
        </div>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => (
            <div key={k.id} className={`border rounded-lg p-3 flex items-center gap-3 transition-colors
              ${k.isActive && k.isValid ? "border-violet-500/30 bg-violet-500/5" : "border-border/30 bg-card/10 opacity-60"}`}>
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
              </div>

              <div className="flex items-center gap-1.5 flex-none">
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

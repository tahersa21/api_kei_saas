import { useEffect, useState, useCallback } from "react";
import { useAdminFetch } from "@/context/admin-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Trash2, Copy, CheckCircle2, Loader2,
  ToggleLeft, ToggleRight, RefreshCw,
} from "lucide-react";

type UserKey = {
  id: string;
  label: string;
  key: string;
  isActive: boolean;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  clerkUserId: string | null;
};

export default function UserKeysPage() {
  const apiFetch = useAdminFetch();
  const [keys, setKeys] = useState<UserKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKeyResult, setNewKeyResult] = useState<UserKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/admin/user-keys");
    const data = (await res.json()) as { keys: UserKey[] };
    setKeys(data.keys ?? []);
    setLoading(false);
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  const createKey = async () => {
    setCreating(true);
    const res = await apiFetch("/api/admin/user-keys", {
      method: "POST",
      body: JSON.stringify({ label: newLabel }),
    });
    const data = (await res.json()) as { key: UserKey };
    setNewKeyResult(data.key);
    setNewLabel("");
    setShowForm(false);
    await load();
    setCreating(false);
  };

  const deleteKey = async (id: string) => {
    await apiFetch(`/api/admin/user-keys/${id}`, { method: "DELETE" });
    setKeys((prev) => prev.filter((k) => k.id !== id));
  };

  const toggleActive = async (id: string, current: boolean) => {
    await apiFetch(`/api/admin/user-keys/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !current }),
    });
    setKeys((prev) => prev.map((k) => k.id === id ? { ...k, isActive: !current } : k));
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold tracking-tight">User API Keys</h1>
          <p className="text-[10px] text-muted-foreground font-sans mt-0.5">Keys you issue to your users — each routes through the CC key pool</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" className="h-7 px-3 text-xs gap-1.5" onClick={() => setShowForm((v) => !v)}>
            <Plus className="w-3.5 h-3.5" />Create Key
          </Button>
        </div>
      </div>

      {showForm && (
        <div className="border border-border/50 rounded-lg p-4 bg-card/50 space-y-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Create New User API Key</p>
          <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createKey(); }}
            className="h-8 text-xs font-sans bg-background/50" placeholder="Label (e.g. customer name or project)" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" className="h-7 px-3 text-xs" onClick={createKey} disabled={creating}>
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Generate"}
            </Button>
          </div>
        </div>
      )}

      {newKeyResult && (
        <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-lg p-4 space-y-2">
          <p className="text-[10px] text-emerald-500 uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Key created — save it now, it won't be shown again in full
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-background/50 border border-border/40 rounded px-3 py-2 text-emerald-400 overflow-x-auto">
              {newKeyResult.key}
            </code>
            <Button size="sm" variant="outline" className="h-8 px-2 gap-1.5 text-xs flex-none" onClick={() => copyKey(newKeyResult.key)}>
              {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <Button size="sm" variant="ghost" className="h-6 text-[10px] text-muted-foreground" onClick={() => setNewKeyResult(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : keys.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground space-y-2">
          <p className="text-xs">No user keys yet</p>
          <p className="text-[10px] font-sans text-muted-foreground/50">Create keys to give your users API access</p>
        </div>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => (
            <div key={k.id} className={`border rounded-lg p-3 flex items-center gap-3 transition-colors
              ${k.isActive ? "border-border/50 bg-card/30" : "border-border/30 bg-card/10 opacity-60"}`}>
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{k.label}</span>
                  {!k.isActive && <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-muted/40 text-muted-foreground">disabled</span>}
                  {k.clerkUserId && <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">self-created</span>}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-sans">
                  <span className="font-mono">{k.key}</span>
                  <span>•</span>
                  <span>{k.usageCount.toLocaleString()} requests</span>
                  {k.lastUsedAt && <><span>•</span><span>last used {new Date(k.lastUsedAt).toLocaleDateString()}</span></>}
                  <span>•</span>
                  <span>created {new Date(k.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-none">
                <button onClick={() => toggleActive(k.id, k.isActive)}
                  title={k.isActive ? "Disable" : "Enable"}
                  className="p-1.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/20 transition-colors">
                  {k.isActive ? <ToggleRight className="w-3.5 h-3.5 text-emerald-500" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => deleteKey(k.id)}
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

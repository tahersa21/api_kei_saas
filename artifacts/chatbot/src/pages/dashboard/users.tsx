import { useEffect, useState, useCallback } from "react";
import { useAdminFetch } from "@/context/admin-auth";
import { Loader2, RefreshCw, Users, Key, Activity, Mail, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

type UserKey = {
  id: string;
  isActive: boolean;
  usageCount: number;
  rpmLimit: number;
  clerkUserId: string | null;
};

type ClerkUser = {
  id: string;
  email: string;
  name: string | null;
  imageUrl: string;
  createdAt: number;
  lastSignInAt: number | null;
  keys: UserKey[];
  totalUsage: number;
};

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function UsersPage() {
  const apiFetch = useAdminFetch();
  const [users, setUsers] = useState<ClerkUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/admin/users");
      const data = await res.json() as { users?: ClerkUser[]; error?: string };
      if (data.error) { setError(data.error); return; }
      setUsers(data.users ?? []);
    } catch {
      setError("Failed to fetch users");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const totalUsers = users.length;
  const usersWithKeys = users.filter(u => u.keys.length > 0).length;
  const totalRequests = users.reduce((s, u) => s + u.totalUsage, 0);

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold tracking-tight">Registered Users</h1>
          <p className="text-[10px] text-muted-foreground font-sans mt-0.5">All users who have signed up via Clerk</p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Users, label: "Total Users", value: totalUsers },
          { icon: Key, label: "Have API Keys", value: usersWithKeys },
          { icon: Activity, label: "Total Requests", value: totalRequests.toLocaleString() },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="border border-border/50 rounded-lg p-3 bg-card/30 flex items-center gap-3">
            <Icon className="w-4 h-4 text-muted-foreground flex-none" />
            <div>
              <p className="text-xs font-bold">{value}</p>
              <p className="text-[10px] text-muted-foreground font-sans">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by name or email…"
        className="w-full h-8 px-3 text-xs font-sans rounded-md border border-border/50 bg-background/50 outline-none focus:ring-1 focus:ring-primary/40 text-foreground placeholder:text-muted-foreground/50"
      />

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="text-center py-16 text-destructive text-xs">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-xs">{search ? "No users match your search" : "No users registered yet"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(u => (
            <div key={u.id} className="border border-border/50 rounded-lg p-3 bg-card/30">
              <div className="flex items-start gap-3">
                {u.imageUrl ? (
                  <img src={u.imageUrl} alt="" className="w-8 h-8 rounded-full flex-none object-cover border border-border/30" />
                ) : (
                  <div className="w-8 h-8 rounded-full flex-none bg-muted/40 border border-border/30 flex items-center justify-center">
                    <span className="text-xs text-muted-foreground">{(u.email[0] ?? "?").toUpperCase()}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium">{u.name ?? u.email}</span>
                    {u.name && (
                      <span className="text-[10px] text-muted-foreground font-sans flex items-center gap-1">
                        <Mail className="w-2.5 h-2.5" />{u.email}
                      </span>
                    )}
                    {u.keys.length > 0 && (
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                        {u.keys.length} key{u.keys.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground font-sans">
                    <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />Joined {timeAgo(u.createdAt)}</span>
                    {u.lastSignInAt && <span>Last sign-in {timeAgo(u.lastSignInAt)}</span>}
                    {u.totalUsage > 0 && <span className="text-primary/70">{u.totalUsage.toLocaleString()} requests</span>}
                  </div>
                  {u.keys.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {u.keys.map(k => (
                        <span key={k.id} className={`text-[9px] font-mono px-2 py-0.5 rounded border ${k.isActive ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400" : "border-border/30 text-muted-foreground/50"}`}>
                          {k.usageCount} req · {k.rpmLimit} rpm
                          {!k.isActive && " · disabled"}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-[9px] font-mono text-muted-foreground/30 flex-none hidden sm:block">{u.id.slice(0, 12)}…</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

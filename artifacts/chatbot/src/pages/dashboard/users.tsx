import { useEffect, useState, useCallback } from "react";
import { useAdminFetch } from "@/context/admin-auth";
import {
  Loader2, RefreshCw, Users, Key, Activity, Mail, Clock,
  ChevronDown, ChevronUp, Plus, Minus, Coins, BarChart2, TrendingUp,
} from "lucide-react";
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
  creditBalance: number;
};

type UsageData = {
  total: number;
  today: number;
  week: number;
  models: { model: string; count: number }[];
  daily: { date: string; requests: number; errors: number }[];
};

type CreditTx = {
  id: string;
  delta: number;
  note: string;
  createdAt: string;
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

function shortModel(m: string): string {
  return m.replace(/^rc:\/[^|]+\|/, "").replace(/^ag:/, "").slice(0, 30);
}

function UserCard({ user, onCreditChange }: { user: ClerkUser; onCreditChange: (id: string, newBalance: number) => void }) {
  const apiFetch = useAdminFetch();
  const [expanded, setExpanded] = useState(false);
  const [creditMode, setCreditMode] = useState<"add" | "deduct" | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditNote, setCreditNote] = useState("");
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditError, setCreditError] = useState<string | null>(null);

  const [usageLoading, setUsageLoading] = useState(false);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [txs, setTxs] = useState<CreditTx[] | null>(null);
  const [showTx, setShowTx] = useState(false);

  const loadUsage = useCallback(async () => {
    if (usage) return;
    setUsageLoading(true);
    try {
      const r = await apiFetch(`/api/admin/users/${user.id}/usage`);
      const d = await r.json() as UsageData;
      setUsage(d);
    } catch { /* ignore */ } finally {
      setUsageLoading(false);
    }
  }, [apiFetch, user.id, usage]);

  const loadTxs = useCallback(async () => {
    if (txs) return;
    setTxLoading(true);
    try {
      const r = await apiFetch(`/api/admin/users/${user.id}/credits`);
      const d = await r.json() as { transactions: CreditTx[] };
      setTxs(d.transactions ?? []);
    } catch { /* ignore */ } finally {
      setTxLoading(false);
    }
  }, [apiFetch, user.id, txs]);

  const handleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) { loadUsage(); loadTxs(); }
  };

  const submitCredit = async () => {
    const amount = parseInt(creditAmount, 10);
    if (!amount || amount <= 0) { setCreditError("أدخل قيمة صحيحة"); return; }
    setCreditLoading(true);
    setCreditError(null);
    try {
      const delta = creditMode === "deduct" ? -amount : amount;
      const r = await apiFetch(`/api/admin/users/${user.id}/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta, note: creditNote || undefined }),
      });
      const d = await r.json() as { balance: number; error?: string };
      if (d.error) { setCreditError(d.error); return; }
      onCreditChange(user.id, d.balance);
      setTxs(null); // reset to reload
      setCreditMode(null);
      setCreditAmount("");
      setCreditNote("");
    } catch { setCreditError("فشل الإرسال"); }
    finally { setCreditLoading(false); }
  };

  const maxBarRequests = usage ? Math.max(...usage.daily.map(d => d.requests), 1) : 1;

  return (
    <div className="border border-border/50 rounded-lg bg-card/30 overflow-hidden">
      {/* Main row */}
      <div className="p-3">
        <div className="flex items-start gap-3">
          {user.imageUrl ? (
            <img src={user.imageUrl} alt="" className="w-9 h-9 rounded-full flex-none object-cover border border-border/30" />
          ) : (
            <div className="w-9 h-9 rounded-full flex-none bg-muted/40 border border-border/30 flex items-center justify-center">
              <span className="text-xs text-muted-foreground">{(user.email[0] ?? "?").toUpperCase()}</span>
            </div>
          )}

          <div className="flex-1 min-w-0">
            {/* Name + badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium">{user.name ?? user.email}</span>
              {user.name && (
                <span className="text-[10px] text-muted-foreground font-sans flex items-center gap-1">
                  <Mail className="w-2.5 h-2.5" />{user.email}
                </span>
              )}
              {user.keys.length > 0 && (
                <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                  {user.keys.length} key{user.keys.length !== 1 ? "s" : ""}
                </span>
              )}
              {/* Credit badge */}
              <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono flex items-center gap-0.5 ${
                (user.creditBalance ?? 0) > 0
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-muted/30 text-muted-foreground border-border/30"
              }`}>
                <Coins className="w-2.5 h-2.5" />
                {(user.creditBalance ?? 0).toLocaleString()} cr
              </span>
            </div>

            {/* Meta */}
            <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground font-sans">
              <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />Joined {timeAgo(user.createdAt)}</span>
              {user.lastSignInAt && <span>Last sign-in {timeAgo(user.lastSignInAt)}</span>}
              {user.totalUsage > 0 && <span className="text-primary/70">{user.totalUsage.toLocaleString()} requests</span>}
            </div>

            {/* Key badges */}
            {user.keys.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {user.keys.map(k => (
                  <span key={k.id} className={`text-[9px] font-mono px-2 py-0.5 rounded border ${k.isActive ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400" : "border-border/30 text-muted-foreground/50"}`}>
                    {k.usageCount} req · {k.rpmLimit} rpm{!k.isActive && " · disabled"}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 flex-none">
            <button
              onClick={() => { setCreditMode(creditMode === "add" ? null : "add"); setCreditError(null); }}
              title="Add Credits"
              className={`h-6 w-6 rounded flex items-center justify-center transition-colors ${creditMode === "add" ? "bg-emerald-500/20 text-emerald-400" : "hover:bg-muted/50 text-muted-foreground"}`}>
              <Plus className="w-3 h-3" />
            </button>
            <button
              onClick={() => { setCreditMode(creditMode === "deduct" ? null : "deduct"); setCreditError(null); }}
              title="Deduct Credits"
              className={`h-6 w-6 rounded flex items-center justify-center transition-colors ${creditMode === "deduct" ? "bg-destructive/20 text-destructive" : "hover:bg-muted/50 text-muted-foreground"}`}>
              <Minus className="w-3 h-3" />
            </button>
            <button
              onClick={handleExpand}
              title="Usage Details"
              className={`h-6 w-6 rounded flex items-center justify-center transition-colors ${expanded ? "bg-primary/20 text-primary" : "hover:bg-muted/50 text-muted-foreground"}`}>
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Credit input panel */}
        {creditMode && (
          <div className="mt-3 pt-3 border-t border-border/30">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-medium ${creditMode === "add" ? "text-emerald-400" : "text-destructive"}`}>
                {creditMode === "add" ? "إضافة رصيد" : "خصم رصيد"}
              </span>
              <span className="text-[10px] text-muted-foreground ml-auto">الرصيد الحالي: <strong className="text-foreground">{(user.creditBalance ?? 0).toLocaleString()}</strong></span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="number"
                min={1}
                value={creditAmount}
                onChange={e => setCreditAmount(e.target.value)}
                placeholder="الكمية"
                className="w-24 h-7 px-2 text-xs font-mono rounded border border-border/50 bg-background/50 outline-none focus:ring-1 focus:ring-primary/40"
                onKeyDown={e => e.key === "Enter" && submitCredit()}
              />
              <input
                type="text"
                value={creditNote}
                onChange={e => setCreditNote(e.target.value)}
                placeholder="ملاحظة (اختياري)"
                className="flex-1 h-7 px-2 text-xs font-sans rounded border border-border/50 bg-background/50 outline-none focus:ring-1 focus:ring-primary/40"
                onKeyDown={e => e.key === "Enter" && submitCredit()}
              />
              <button
                onClick={submitCredit}
                disabled={creditLoading || !creditAmount}
                className={`h-7 px-3 text-[10px] font-medium rounded transition-colors disabled:opacity-50 ${
                  creditMode === "add"
                    ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                    : "bg-destructive/20 text-destructive hover:bg-destructive/30"
                }`}>
                {creditLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : "تأكيد"}
              </button>
              <button onClick={() => setCreditMode(null)} className="h-7 px-2 text-[10px] text-muted-foreground hover:text-foreground rounded hover:bg-muted/30 transition-colors">إلغاء</button>
            </div>
            {creditError && <p className="text-[10px] text-destructive mt-1">{creditError}</p>}
          </div>
        )}
      </div>

      {/* Expanded usage + transactions */}
      {expanded && (
        <div className="border-t border-border/30 bg-muted/10 p-3 space-y-4">
          {usageLoading ? (
            <div className="flex items-center justify-center h-16">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            </div>
          ) : usage ? (
            <>
              {/* Usage summary */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Total", value: usage.total.toLocaleString(), icon: Activity },
                  { label: "This Week", value: usage.week.toLocaleString(), icon: TrendingUp },
                  { label: "Today", value: usage.today.toLocaleString(), icon: BarChart2 },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="bg-card/40 border border-border/30 rounded-md px-3 py-2 flex items-center gap-2">
                    <Icon className="w-3 h-3 text-muted-foreground flex-none" />
                    <div>
                      <p className="text-[10px] font-bold">{value}</p>
                      <p className="text-[9px] text-muted-foreground font-sans">{label}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* 14-day bar chart */}
              {usage.daily.some(d => d.requests > 0) && (
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-2">14-Day Activity</p>
                  <div className="flex items-end gap-0.5 h-10">
                    {usage.daily.map(d => (
                      <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                        <div
                          className="w-full bg-primary/30 hover:bg-primary/50 rounded-sm transition-colors cursor-default"
                          style={{ height: `${Math.round((d.requests / maxBarRequests) * 100)}%`, minHeight: d.requests > 0 ? "2px" : "0" }}
                        />
                        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-popover border border-border/50 rounded px-1.5 py-0.5 text-[9px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                          {d.date.slice(5)}: {d.requests}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top models */}
              {usage.models.length > 0 && (
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-2">Top Models</p>
                  <div className="space-y-1">
                    {usage.models.slice(0, 6).map(m => {
                      const pct = usage.total > 0 ? (m.count / usage.total) * 100 : 0;
                      return (
                        <div key={m.model} className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-foreground/70 w-36 truncate flex-none">{shortModel(m.model)}</span>
                          <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                            <div className="h-full bg-primary/50 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[9px] text-muted-foreground w-10 text-right flex-none">{m.count.toLocaleString()}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : null}

          {/* Transaction history */}
          <div>
            <button
              onClick={() => { setShowTx(v => !v); if (!showTx && !txs) loadTxs(); }}
              className="text-[9px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              <Coins className="w-2.5 h-2.5" />
              Credit History
              {txLoading && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
            </button>
            {showTx && (
              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                {(txs ?? []).length === 0 ? (
                  <p className="text-[10px] text-muted-foreground">لا توجد معاملات</p>
                ) : (txs ?? []).map(tx => (
                  <div key={tx.id} className="flex items-center gap-2 text-[10px]">
                    <span className={`font-mono ${tx.delta >= 0 ? "text-emerald-400" : "text-destructive"}`}>
                      {tx.delta >= 0 ? "+" : ""}{tx.delta}
                    </span>
                    <span className="text-muted-foreground flex-1 truncate font-sans">{tx.note}</span>
                    <span className="text-muted-foreground/50 font-sans flex-none">{new Date(tx.createdAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
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

  const handleCreditChange = (id: string, newBalance: number) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, creditBalance: newBalance } : u));
  };

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const totalUsers = users.length;
  const usersWithKeys = users.filter(u => u.keys.length > 0).length;
  const totalRequests = users.reduce((s, u) => s + u.totalUsage, 0);
  const totalCredits = users.reduce((s, u) => s + u.creditBalance, 0);

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
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: Users, label: "Total Users", value: totalUsers },
          { icon: Key, label: "Have API Keys", value: usersWithKeys },
          { icon: Activity, label: "Total Requests", value: totalRequests.toLocaleString() },
          { icon: Coins, label: "Total Credits", value: totalCredits.toLocaleString() },
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
            <UserCard key={u.id} user={u} onCreditChange={handleCreditChange} />
          ))}
        </div>
      )}
    </div>
  );
}

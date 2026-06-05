import { useState, useEffect, useCallback } from "react";
import { useUser, UserButton } from "@clerk/react";
import {
  Home, LayoutDashboard, FileText, Key, Cpu, CreditCard, MessageSquare,
  Users, Phone, ChevronLeft, ChevronRight, RefreshCw, Copy, Check,
  Search, ExternalLink, Bell, Globe, Shield, Plus, Trash2, ToggleLeft, ToggleRight, Eye, EyeOff,
  BookOpen, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────
type Stats = {
  totalRequests: number; rangeRequests: number; todayRequests: number;
  topModels: { model: string; count: number }[];
  recentLogs: { model: string; status: string; elapsedMs: number | null; createdAt: string }[];
};
type UserKey = {
  id: string; label: string; key: string; isActive: boolean;
  usageCount: number; lastUsedAt: string | null; createdAt: string;
};
type Log = { id: string; model: string; status: string; elapsedMs: number | null; createdAt: string };
type LogsResponse = { total: number; page: number; pageSize: number; logs: Log[] };
type Range = "today" | "7d" | "30d";

const ANNOUNCEMENTS = [
  { date: "1 day ago", pinned: true, text: "Platform update: New CC models added including DeepSeek-V3 and Qwen 2.5-Max. Enjoy faster response times with optimised routing." },
  { date: "2 days ago", pinned: true, text: "Right Code /claude channel maintenance completed. Service fully restored with improved stability." },
  { date: "3 days ago", pinned: false, text: "API key rotation reminder: For security, rotate your API keys every 90 days." },
];

// ── API helper (Clerk session cookie sent automatically) ──────────────────────
async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(path, { credentials: "include", ...opts });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch { return null; }
}

// ── Shared components ─────────────────────────────────────────────────────────
function StatCard({ dot, label, value, sub, icon }: { dot: string; label: string; value: string | number; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5 flex flex-col gap-3 hover:border-white/20 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dot}`} />
          <span className="text-[11px] text-white/40 tracking-widest uppercase font-medium">{label}</span>
        </div>
        {icon}
      </div>
      <span className="text-3xl font-bold text-white">{value}</span>
      {sub && <span className="text-xs text-white/30">{sub}</span>}
    </div>
  );
}

function RangeTabs({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="flex gap-1.5">
      {(["today", "7d", "30d"] as Range[]).map(r => (
        <button key={r} onClick={() => onChange(r)}
          className={`px-3 py-1 text-xs rounded-md transition-colors font-medium ${value === r ? "bg-[#f97316] text-white" : "bg-white/5 text-white/50 hover:text-white hover:bg-white/10"}`}>
          {r === "today" ? "Today" : r === "7d" ? "7 days" : "30 days"}
        </button>
      ))}
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-40 text-center">
      <p className="text-sm text-white/30 font-medium">No data</p>
      <p className="text-xs text-white/20 mt-1">{text}</p>
    </div>
  );
}

function CopyBtn({ text, size = "sm" }: { text: string; size?: "sm" | "md" }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const cls = size === "md" ? "w-4 h-4" : "w-3.5 h-3.5";
  return (
    <button onClick={copy} className="p-1 text-white/30 hover:text-white/70 transition-colors">
      {copied ? <Check className={`${cls} text-green-400`} /> : <Copy className={cls} />}
    </button>
  );
}

// ── New Key Modal ─────────────────────────────────────────────────────────────
function NewKeyModal({ fullKey, onClose }: { fullKey: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#18181b] border border-white/10 rounded-2xl p-7 w-full max-w-lg space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center">
            <Key className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">API Key Created</h2>
            <p className="text-xs text-white/40 mt-0.5">Copy and save it now — it won't be shown again.</p>
          </div>
        </div>
        <div className="bg-black/40 border border-white/10 rounded-lg p-4 flex items-center gap-2">
          <code className="flex-1 font-mono text-green-400 text-sm break-all">{fullKey}</code>
          <CopyBtn text={fullKey} size="md" />
        </div>
        <p className="text-xs text-yellow-400/70 bg-yellow-500/5 border border-yellow-500/10 rounded-lg px-3 py-2">
          ⚠ Store this key securely. It will not be displayed again after you close this dialog.
        </p>
        <Button onClick={onClose} className="w-full bg-[#f97316] hover:bg-[#ea6c0f] border-0 text-white">
          I've saved it
        </Button>
      </div>
    </div>
  );
}

// ── HOME PAGE ─────────────────────────────────────────────────────────────────
function HomePage({ stats, keyCount, loading, range, onRange }: { stats: Stats | null; keyCount: number; loading: boolean; range: Range; onRange: (r: Range) => void }) {
  const val = (n: number) => loading ? "…" : String(n);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">Home</h1>
        <RangeTabs value={range} onChange={onRange} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard dot="bg-blue-400" label="Today's Requests" value={val(stats?.todayRequests ?? 0)} icon={<FileText className="w-4 h-4 text-blue-400/50" />} />
        <StatCard dot="bg-green-400" label="Total Requests" value={val(stats?.totalRequests ?? 0)} icon={<LayoutDashboard className="w-4 h-4 text-green-400/50" />} />
        <StatCard dot="bg-purple-400" label="Today's Tokens" value="0" icon={<Cpu className="w-4 h-4 text-purple-400/50" />} />
        <StatCard dot="bg-orange-400" label="Total Tokens" value="0" icon={<Cpu className="w-4 h-4 text-orange-400/50" />} />
        <StatCard dot="bg-yellow-400" label="Today's Cost" value="$0.00" icon={<CreditCard className="w-4 h-4 text-yellow-400/50" />} />
        <StatCard dot="bg-red-400" label="Total Cost" value="$0.00" icon={<CreditCard className="w-4 h-4 text-red-400/50" />} />
        <StatCard dot="bg-cyan-400" label="My API Keys" value={keyCount} icon={<Key className="w-4 h-4 text-cyan-400/50" />} />
        <StatCard dot="bg-pink-400" label="Total Invites" value="0" icon={<Users className="w-4 h-4 text-pink-400/50" />} />
      </div>
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-white/40" />
            <span className="text-sm font-semibold text-white">Announcements</span>
          </div>
          <span className="text-xs text-white/30">{ANNOUNCEMENTS.length} updates</span>
        </div>
        <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
          {ANNOUNCEMENTS.map((a, i) => (
            <div key={i} className="space-y-1.5 pb-4 border-b border-white/[0.06] last:border-0 last:pb-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/30">{a.date}</span>
                {a.pinned && <span className="text-[10px] bg-[#f97316]/20 text-[#f97316] px-2 py-0.5 rounded-full font-medium">Pinned</span>}
              </div>
              <p className="text-sm text-white/70 leading-relaxed">{a.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── DASHBOARD PAGE ────────────────────────────────────────────────────────────
function DashboardPage({ stats, loading, range, onRange }: { stats: Stats | null; loading: boolean; range: Range; onRange: (r: Range) => void }) {
  const val = (n: number) => loading ? "…" : String(n);
  const COLORS = ["#f97316", "#8b5cf6", "#06b6d4", "#22c55e", "#ec4899", "#eab308"];
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">Dashboard</h1>
        <RangeTabs value={range} onChange={onRange} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard dot="bg-green-400" label="Balance" value="$0.00" />
        <StatCard dot="bg-orange-400" label="Total Cost" value="$0.00" />
        <StatCard dot="bg-blue-400" label="Total Tokens" value="0" />
        <StatCard dot="bg-red-400" label="Total Requests" value={val(stats?.rangeRequests ?? 0)} />
      </div>
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Rate Limits</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {["/claude", "/codex-pro", "/deepseek", "/gemini"].map(prefix => (
            <div key={prefix} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4 space-y-2">
              <p className="text-sm font-mono text-white font-medium">{prefix}</p>
              <p className="text-xs text-white/40">Channel</p>
              <div className="space-y-1.5 text-xs text-white/50">
                <div className="flex justify-between"><span>RPM</span><span>0 / 400</span></div>
                <div className="h-1 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-[#f97316] w-0 rounded-full" /></div>
                <div className="flex justify-between"><span>Concurrency</span><span>0 / 200</span></div>
                <div className="h-1 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-blue-500 w-0 rounded-full" /></div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Token Distribution</h3>
          {stats && stats.topModels.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={stats.topModels} dataKey="count" nameKey="model" cx="50%" cy="50%" outerRadius={70}>
                  {stats.topModels.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => [v, "Requests"]} contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} labelStyle={{ color: "rgba(255,255,255,0.7)" }} itemStyle={{ color: "#fff" }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No model usage data available." />}
        </div>
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Requests by Model</h3>
          {stats && stats.topModels.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={stats.topModels.slice(0, 6)} margin={{ left: -20 }}>
                <XAxis dataKey="model" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} tickFormatter={v => v.length > 10 ? v.slice(0, 10) + "…" : v} />
                <YAxis tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} />
                <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} labelStyle={{ color: "rgba(255,255,255,0.7)" }} itemStyle={{ color: "#fff" }} />
                <Bar dataKey="count" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No model aggregation data for this period." />}
        </div>
      </div>
    </div>
  );
}

// ── USAGE LOGS PAGE ───────────────────────────────────────────────────────────
function UsageLogsPage() {
  const [range, setRange] = useState<Range>("today");
  const [modelFilter, setModelFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ range, page: String(page), pageSize: "20" });
    if (modelFilter) params.set("model", modelFilter);
    if (statusFilter) params.set("status", statusFilter);
    const res = await apiFetch<LogsResponse>(`/api/user/logs?${params}`);
    setData(res);
    setLoading(false);
  }, [range, page, modelFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">Usage Logs</h1>
        <button onClick={load} disabled={loading} className="p-1.5 rounded text-white/40 hover:text-white hover:bg-white/5 transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/50 font-medium uppercase tracking-wider">Filters</span>
          <div className="ml-auto flex gap-2">
            <button onClick={() => { setModelFilter(""); setStatusFilter(""); setPage(1); }}
              className="text-xs text-white/40 hover:text-white px-2 py-1 rounded border border-white/10 hover:border-white/20 transition-colors">Reset</button>
            <button onClick={() => { setPage(1); load(); }}
              className="text-xs text-white/70 hover:text-white px-2 py-1 rounded border border-white/20 hover:border-white/40 transition-colors">Search</button>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-white/40 mb-1 block">Date Range</label>
            <RangeTabs value={range} onChange={r => { setRange(r); setPage(1); }} />
          </div>
          <div>
            <label className="text-xs text-white/40 mb-1 block">Model</label>
            <Input value={modelFilter} onChange={e => setModelFilter(e.target.value)}
              placeholder="e.g. gpt-5" className="h-8 bg-white/5 border-white/10 text-white text-xs placeholder:text-white/20" />
          </div>
          <div>
            <label className="text-xs text-white/40 mb-1 block">Status</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="w-full h-8 bg-white/5 border border-white/10 rounded-md px-2 text-xs text-white/70">
              <option value="">All</option>
              <option value="ok">OK</option>
              <option value="error">Error</option>
            </select>
          </div>
        </div>
      </div>
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06] text-white/40 uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">Model</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Duration</th>
                <th className="text-left px-4 py-3 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="text-center py-12 text-white/30">Loading…</td></tr>
              ) : !data || data.logs.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-12 text-white/30">
                  <p className="font-medium text-sm">No logs</p>
                  <p className="text-white/20 mt-1">No usage logs found for this period</p>
                </td></tr>
              ) : data.logs.map(log => (
                <tr key={log.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 font-mono text-white/80">{log.model}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${log.status === "ok" ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                      {log.status === "ok" ? "OK" : "Error"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white/40 font-mono">{log.elapsedMs ? `${(log.elapsedMs / 1000).toFixed(1)}s` : "—"}</td>
                  <td className="px-4 py-3 text-white/40">{new Date(log.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && (
          <div className="px-4 py-3 border-t border-white/[0.06] flex items-center justify-between">
            <span className="text-xs text-white/30">{data.total} records</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="text-xs text-white/40 hover:text-white disabled:opacity-30 px-2 py-1">Prev</button>
              <span className="text-xs text-white/40">{page} / {totalPages || 1}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="text-xs text-white/40 hover:text-white disabled:opacity-30 px-2 py-1">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── API KEYS PAGE ─────────────────────────────────────────────────────────────
function ApiKeysPage({ keys, loadingKeys, onRefresh }: { keys: UserKey[]; loadingKeys: boolean; onRefresh: () => void }) {
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newFullKey, setNewFullKey] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const createKey = async () => {
    setCreating(true);
    const res = await apiFetch<{ key: UserKey }>("/api/user/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newLabel.trim() || undefined }),
    });
    setCreating(false);
    if (res?.key) {
      setNewFullKey(res.key.key);
      setShowCreate(false);
      setNewLabel("");
      onRefresh();
    }
  };

  const toggleKey = async (id: string) => {
    setTogglingId(id);
    await apiFetch(`/api/user/keys/${id}/toggle`, { method: "PATCH" });
    setTogglingId(null);
    onRefresh();
  };

  const deleteKey = async (id: string) => {
    if (!confirm("Delete this API key? This action cannot be undone.")) return;
    setDeletingId(id);
    await apiFetch(`/api/user/keys/${id}`, { method: "DELETE" });
    setDeletingId(null);
    onRefresh();
  };

  const filtered = keys.filter(k => k.label.toLowerCase().includes(search.toLowerCase()));
  const activeCount = keys.filter(k => k.isActive).length;

  return (
    <div className="space-y-4">
      {newFullKey && <NewKeyModal fullKey={newFullKey} onClose={() => setNewFullKey(null)} />}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#18181b] border border-white/10 rounded-2xl p-7 w-full max-w-md space-y-5">
            <h2 className="text-base font-bold text-white">Create API Key</h2>
            <div className="space-y-1.5">
              <label className="text-xs text-white/50">Key name (optional)</label>
              <Input value={newLabel} onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !creating && createKey()}
                placeholder="e.g. My App" className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-[#f97316]/50" />
              <p className="text-xs text-white/30">Defaults to "Key N" if left empty. Max 5 keys per account.</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowCreate(false)} className="flex-1 border-white/10 bg-transparent text-white/60 hover:text-white hover:bg-white/5">Cancel</Button>
              <Button onClick={createKey} disabled={creating} className="flex-1 bg-[#f97316] hover:bg-[#ea6c0f] border-0 text-white">
                {creating ? "Creating…" : "Create Key"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">API Keys</h1>
        <Button onClick={() => setShowCreate(true)} disabled={keys.length >= 5}
          className="bg-[#f97316] hover:bg-[#ea6c0f] border-0 text-white text-xs h-8 gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Create Key
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard dot="bg-orange-400" label="Total Keys" value={keys.length} />
        <StatCard dot="bg-green-400" label="Active" value={activeCount} />
        <StatCard dot="bg-red-400" label="Inactive" value={keys.length - activeCount} />
      </div>

      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search keys…"
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/20" />
          </div>
          <button onClick={onRefresh} disabled={loadingKeys} className="p-1.5 text-white/30 hover:text-white transition-colors">
            <RefreshCw className={`w-4 h-4 ${loadingKeys ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06] text-white/40 uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Key</th>
                <th className="text-left px-4 py-3 font-medium">Usage</th>
                <th className="text-left px-4 py-3 font-medium">Created</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingKeys ? (
                <tr><td colSpan={6} className="text-center py-12 text-white/30">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-16">
                  <div className="space-y-3">
                    <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center mx-auto">
                      <Key className="w-6 h-6 text-white/20" />
                    </div>
                    <p className="text-sm text-white/30 font-medium">{keys.length === 0 ? "No API keys yet" : "No matching keys"}</p>
                    {keys.length === 0 && (
                      <Button onClick={() => setShowCreate(true)} className="bg-[#f97316] hover:bg-[#ea6c0f] border-0 text-white text-xs h-8 gap-1.5">
                        <Plus className="w-3.5 h-3.5" /> Create your first key
                      </Button>
                    )}
                  </div>
                </td></tr>
              ) : filtered.map(k => (
                <tr key={k.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-white/80 font-medium">{k.label}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 font-mono text-white/50">
                      <span>{k.key}</span>
                      <CopyBtn text={k.key} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white/40">{k.usageCount} req</td>
                  <td className="px-4 py-3 text-white/40">{new Date(k.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${k.isActive ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                      {k.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => toggleKey(k.id)} disabled={togglingId === k.id}
                        title={k.isActive ? "Deactivate" : "Activate"}
                        className="p-1.5 rounded text-white/30 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50">
                        {k.isActive ? <ToggleRight className="w-4 h-4 text-green-400" /> : <ToggleLeft className="w-4 h-4" />}
                      </button>
                      <button onClick={() => deleteKey(k.id)} disabled={deletingId === k.id}
                        title="Delete" className="p-1.5 rounded text-white/30 hover:text-red-400 hover:bg-red-500/5 transition-colors disabled:opacity-50">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {keys.length >= 5 && (
          <div className="px-4 py-3 border-t border-white/[0.06]">
            <p className="text-xs text-yellow-400/70">Maximum 5 API keys per account reached. Delete an existing key to create a new one.</p>
          </div>
        )}
      </div>

      {/* Usage instructions */}
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3">How to use your API key</h3>
        <p className="text-xs text-white/50 mb-3">Add the <code className="text-[#f97316] font-mono">X-Api-Key</code> header to your requests:</p>
        <div className="bg-black/40 rounded-lg p-4 font-mono text-xs text-green-400 relative">
          <pre className="overflow-x-auto whitespace-pre">{`curl https://your-domain.com/api/chat/stream \\
  -H "X-Api-Key: sk-cc-..." \\
  -H "Content-Type: application/json" \\
  -d '{"model":"rc:/codex-pro|gpt-5.4","messages":[{"role":"user","content":"Hello"}]}'`}</pre>
        </div>
      </div>
    </div>
  );
}

// ── MODELS PAGE ───────────────────────────────────────────────────────────────
const MODELS_LIST = [
  { channel: "/claude", models: ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-3-5"], type: "Anthropic" },
  { channel: "/claude-aws", models: ["claude-opus-4-5", "claude-sonnet-4-5"], type: "Anthropic (AWS)" },
  { channel: "/codex-pro", models: ["gpt-5.4", "gpt-5.4-mini", "gpt-5", "gpt-4o", "o3", "o4-mini"], type: "OpenAI Completions" },
  { channel: "/codex", models: ["gpt-5.4", "gpt-5", "o3", "o4-mini"], type: "OpenAI Responses" },
  { channel: "/gemini", models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"], type: "Google Gemini" },
  { channel: "/deepseek", models: ["deepseek-chat", "deepseek-reasoner"], type: "DeepSeek (OAI)" },
  { channel: "/deepseek/anthropic", models: ["deepseek-chat", "deepseek-reasoner"], type: "DeepSeek (Anthropic)" },
];

function ModelsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-white">Available Models</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {MODELS_LIST.map(group => (
          <div key={group.channel} className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-mono font-bold text-white">{group.channel}</p>
                <p className="text-xs text-white/40 mt-0.5">{group.type}</p>
              </div>
              <span className="text-xs bg-[#f97316]/10 text-[#f97316] px-2 py-0.5 rounded-full">{group.models.length} models</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {group.models.map(m => (
                <span key={m} className="text-xs font-mono bg-white/5 text-white/60 px-2 py-1 rounded border border-white/[0.08]">{m}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-white/30 text-center">Model IDs: <code className="text-[#f97316]">rc:&#123;channel&#125;|&#123;model&#125;</code> — e.g. <code className="text-[#f97316]">rc:/codex-pro|gpt-5.4</code></p>
    </div>
  );
}

// ── SUBSCRIBE PAGE ────────────────────────────────────────────────────────────
function SubscribePage() {
  const [amount, setAmount] = useState("1");
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-white">Subscribe</h1>
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Balance Top-up</h2>
          <span className="text-xs text-green-400 border border-green-500/20 bg-green-500/10 px-3 py-1 rounded-full flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full" /> Current balance $0.00
          </span>
        </div>
        <div>
          <label className="text-sm text-white/60 mb-2 block">Top-up amount ($)</label>
          <div className="flex gap-3">
            <div className="flex items-center gap-2 flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5">
              <span className="text-white/50 text-sm">$</span>
              <input type="number" value={amount} min={1} onChange={e => setAmount(e.target.value)}
                className="bg-transparent flex-1 text-white text-sm focus:outline-none" />
            </div>
            <button className="bg-green-500 hover:bg-green-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors">
              Recharge Now
            </button>
          </div>
        </div>
      </div>
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6">
        <h2 className="text-base font-semibold text-white mb-4">Packages</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[{ name: "Starter", price: "$5", features: ["5M tokens", "All channels", "Email support"] },
            { name: "Pro", price: "$20", features: ["25M tokens", "Priority routing", "Priority support"], popular: true },
            { name: "Enterprise", price: "$100", features: ["Unlimited tokens", "Dedicated routing", "24/7 support"] }].map(pkg => (
            <div key={pkg.name} className={`border rounded-xl p-5 space-y-4 ${pkg.popular ? "border-[#f97316]/40 bg-[#f97316]/5" : "border-white/[0.08] bg-white/[0.02]"}`}>
              {pkg.popular && <span className="text-[10px] bg-[#f97316] text-white px-2 py-0.5 rounded-full">POPULAR</span>}
              <div>
                <h3 className="text-base font-bold text-white">{pkg.name}</h3>
                <p className="text-2xl font-bold text-white mt-1">{pkg.price}<span className="text-xs text-white/40">/mo</span></p>
              </div>
              <ul className="space-y-1.5">
                {pkg.features.map(f => <li key={f} className="text-xs text-white/60 flex items-center gap-2"><span className="text-green-400">✓</span>{f}</li>)}
              </ul>
              <button className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${pkg.popular ? "bg-[#f97316] hover:bg-[#ea6c0f] text-white" : "bg-white/5 hover:bg-white/10 text-white/70"}`}>
                Subscribe
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── INVITE PAGE ───────────────────────────────────────────────────────────────
function InvitePage({ userId }: { userId: string }) {
  const code = userId.slice(-8);
  const link = `${window.location.origin}/sign-up?ref=${code}`;
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-white">Invite & Earn</h1>
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-sm bg-purple-500/20 text-purple-400 px-3 py-1 rounded-full">Your rebate: 5%</span>
          <span className="text-sm bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full">Friend bonus: 5%</span>
        </div>
        <p className="text-sm text-white/60">When a friend pays, both of you receive <span className="text-[#f97316] font-semibold">5%</span> of the paid amount as balance.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-white/40 uppercase tracking-wider mb-1.5 block">My invite code</label>
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5">
              <span className="font-mono text-sm text-green-400">{code}</span>
              <CopyBtn text={code} />
            </div>
          </div>
          <div>
            <label className="text-xs text-white/40 uppercase tracking-wider mb-1.5 block">Invite link</label>
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5">
              <span className="text-sm text-white/50 font-mono truncate flex-1">{link.slice(0, 40)}…</span>
              <CopyBtn text={link} />
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <StatCard dot="bg-red-400" label="Total Invitees" value="0" />
        <StatCard dot="bg-green-400" label="Total Balance Earned" value="$0.00" />
      </div>
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <div className="flex gap-4">
            <button className="text-sm text-[#f97316] border-b-2 border-[#f97316] pb-1 font-medium">Invitees</button>
          </div>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.06] text-white/40 uppercase tracking-wider">
              <th className="text-left px-5 py-3 font-medium">Username</th>
              <th className="text-left px-5 py-3 font-medium">Email</th>
              <th className="text-left px-5 py-3 font-medium">Registered At</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colSpan={3} className="text-center py-12 text-white/30">No invitees yet</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── CONTACT PAGE ──────────────────────────────────────────────────────────────
function ContactPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-white">Contact</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[{ icon: <Globe className="w-5 h-5 text-[#f97316]" />, title: "Website", value: "commandcode.ai", href: "https://commandcode.ai" },
          { icon: <MessageSquare className="w-5 h-5 text-blue-400" />, title: "Telegram", value: "@commandcode_support", href: "#" },
          { icon: <Shield className="w-5 h-5 text-green-400" />, title: "API Docs", value: "View documentation", href: "#" },
          { icon: <Phone className="w-5 h-5 text-purple-400" />, title: "Support", value: "support@commandcode.ai", href: "mailto:support@commandcode.ai" }].map(c => (
          <a key={c.title} href={c.href} target="_blank" rel="noreferrer"
            className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5 flex items-center gap-4 hover:border-white/20 transition-colors group">
            <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center group-hover:bg-white/10 transition-colors">{c.icon}</div>
            <div>
              <p className="text-sm font-semibold text-white">{c.title}</p>
              <p className="text-xs text-white/40 mt-0.5 flex items-center gap-1">{c.value}<ExternalLink className="w-3 h-3" /></p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

// ── DOCS PAGE ─────────────────────────────────────────────────────────────────
const BASE = window.location.origin;

function CodeBlock({ code, lang = "bash" }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group">
      <div className="flex items-center justify-between px-4 py-2 bg-white/[0.04] border border-white/[0.08] rounded-t-lg border-b-0">
        <span className="text-[10px] text-white/30 font-mono uppercase tracking-widest">{lang}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="flex items-center gap-1.5 text-[10px] text-white/30 hover:text-white/70 transition-colors">
          {copied ? <><Check className="w-3 h-3 text-green-400" /><span className="text-green-400">Copied!</span></>
            : <><Copy className="w-3 h-3" /><span>Copy</span></>}
        </button>
      </div>
      <pre className="bg-black/40 border border-white/[0.08] rounded-b-lg px-4 py-4 overflow-x-auto text-xs font-mono text-green-300 leading-relaxed">{code}</pre>
    </div>
  );
}

function DocSection({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.03] transition-colors text-left">
        <span className="text-sm font-semibold text-white">{title}</span>
        <ChevronDown className={`w-4 h-4 text-white/30 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="px-5 pb-5 space-y-4 border-t border-white/[0.06] pt-4">{children}</div>}
    </div>
  );
}

function ClaudeCodeSection({ apiKey, base }: { apiKey: string; base: string }) {
  const [os, setOs] = useState<"mac" | "cmd" | "ps">("mac");
  const tabs = [{ id: "mac", label: "🍎 macOS / Linux" }, { id: "cmd", label: "🪟 Windows CMD" }, { id: "ps", label: "⚡ PowerShell" }] as const;
  return (
    <div className="space-y-4">
      <p className="text-xs text-white/50 leading-relaxed">
        اضبط هذه المتغيرات في بيئتك ثم شغّل <code className="text-[#f97316] font-mono">claude</code> كالمعتاد. يستخدم Claude Code المتغير <code className="text-[#f97316] font-mono">ANTHROPIC_AUTH_TOKEN</code> وليس <code className="text-yellow-400/70 font-mono">API_KEY</code>.
      </p>
      <div className="flex gap-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setOs(t.id)}
            className={`text-[10px] px-3 py-1.5 rounded-md font-medium transition-all ${os === t.id ? "bg-[#f97316]/20 text-[#f97316]" : "text-white/30 hover:text-white/60"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {os === "mac" && <CodeBlock lang="bash" code={`export ANTHROPIC_BASE_URL="${base}/api/proxy/claude"
export ANTHROPIC_AUTH_TOKEN="${apiKey}"
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1

claude`} />}
      {os === "cmd" && <CodeBlock lang="bash" code={`set ANTHROPIC_BASE_URL=${base}/api/proxy/claude
set ANTHROPIC_AUTH_TOKEN=${apiKey}
set CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1

claude`} />}
      {os === "ps" && <CodeBlock lang="bash" code={`$env:ANTHROPIC_BASE_URL="${base}/api/proxy/claude"
$env:ANTHROPIC_AUTH_TOKEN="${apiKey}"
$env:CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1

claude`} />}
      <div>
        <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">VSCode Claude Code — <code className="normal-case font-mono">~/.claude/settings.json</code></p>
        <CodeBlock lang="json" code={`{
  "env": {
    "ANTHROPIC_BASE_URL": "${base}/api/proxy/claude",
    "ANTHROPIC_AUTH_TOKEN": "${apiKey}",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
    "CLAUDE_CODE_ATTRIBUTION_HEADER": "0"
  }
}`} />
      </div>
    </div>
  );
}

function CodexSection({ apiKey, base }: { apiKey: string; base: string }) {
  const [os, setOs] = useState<"mac" | "win">("mac");
  return (
    <div className="space-y-4">
      <p className="text-xs text-white/50 leading-relaxed">
        Codex CLI يستخدم ملف <code className="text-[#f97316] font-mono">~/.codex/config.toml</code> للإعدادات
        و<code className="text-[#f97316] font-mono">~/.codex/auth.json</code> للمفتاح. اضبط <code className="text-[#f97316] font-mono">wire_api = "responses"</code> لاستخدام OpenAI Responses API.
      </p>
      <div className="flex gap-1">
        {[{ id: "mac", label: "🍎 macOS / Linux" }, { id: "win", label: "🪟 Windows" }].map(t => (
          <button key={t.id} onClick={() => setOs(t.id as "mac" | "win")}
            className={`text-[10px] px-3 py-1.5 rounded-md font-medium transition-all ${os === t.id ? "bg-[#f97316]/20 text-[#f97316]" : "text-white/30 hover:text-white/60"}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div>
        <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">
          {os === "mac" ? "~/.codex/config.toml" : "%USERPROFILE%\\.codex\\config.toml"}
        </p>
        <CodeBlock lang="toml" code={`model_provider = "OpenAI"
model = "gpt-5.5"
review_model = "gpt-5.5"
model_reasoning_effort = "xhigh"
disable_response_storage = true
network_access = "enabled"
model_context_window = 200000
model_auto_compact_token_limit = 160000

[model_providers.OpenAI]
name = "OpenAI"
base_url = "${base}/api/proxy/codex"
wire_api = "responses"
requires_openai_auth = true

[features]
goals = true`} />
      </div>
      <div>
        <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">
          {os === "mac" ? "~/.codex/auth.json" : "%USERPROFILE%\\.codex\\auth.json"}
        </p>
        <CodeBlock lang="json" code={`{
  "OPENAI_API_KEY": "${apiKey}"
}`} />
      </div>
      <div className="bg-blue-500/5 border border-blue-500/15 rounded-lg px-4 py-3 text-xs text-blue-400/70">
        تأكد من وجود المجلد أولاً:
        <code className="block font-mono text-white/40 mt-1">{os === "mac" ? "mkdir -p ~/.codex" : "mkdir %USERPROFILE%\\.codex"}</code>
      </div>
    </div>
  );
}

function DocsPage({ apiKey }: { apiKey: string }) {
  const key = apiKey || "sk-cc-YOUR_API_KEY";
  const streamUrl = `${BASE}/api/chat/stream`;
  const modelsUrl = `${BASE}/api/chat/models`;
  const rcModelsUrl = `${BASE}/api/chat/rc-models`;

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-lg font-bold text-white">API Documentation</h1>
        <p className="text-xs text-white/40 mt-1">Everything you need to integrate CommandCode into your application.</p>
      </div>

      {/* Quick Start */}
      <DocSection title="🚀 Quick Start">
        <p className="text-xs text-white/50 leading-relaxed">
          CommandCode provides an OpenAI-compatible chat streaming API. Send requests to <code className="text-[#f97316] font-mono">/api/chat/stream</code> with your API key in the <code className="text-[#f97316] font-mono">X-Api-Key</code> header.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {[
            { label: "Base URL", value: BASE, color: "text-blue-400" },
            { label: "Chat Endpoint", value: "/api/chat/stream", color: "text-green-400" },
            { label: "Auth Header", value: "X-Api-Key", color: "text-[#f97316]" },
          ].map(item => (
            <div key={item.label} className="bg-black/30 rounded-lg px-4 py-3 border border-white/[0.06]">
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1">{item.label}</p>
              <code className={`font-mono ${item.color}`}>{item.value}</code>
            </div>
          ))}
        </div>
      </DocSection>

      {/* Authentication */}
      <DocSection title="🔑 Authentication">
        <p className="text-xs text-white/50 leading-relaxed">
          Pass your API key via the <code className="text-[#f97316] font-mono">X-Api-Key</code> header on every request.
        </p>
        <CodeBlock lang="bash" code={`curl ${streamUrl} \\
  -H "X-Api-Key: ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "zai-org/GLM-5",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'`} />
        <div className="bg-yellow-500/5 border border-yellow-500/15 rounded-lg px-4 py-3">
          <p className="text-xs text-yellow-400/80">⚠ Keep your API key private. Never expose it in frontend code or public repositories.</p>
        </div>
      </DocSection>

      {/* Model IDs */}
      <DocSection title="🤖 Model IDs">
        <p className="text-xs text-white/50 leading-relaxed">
          Models are identified by a prefix that indicates the provider:
        </p>
        <div className="space-y-2">
          {[
            { prefix: "zai-org/GLM-5", desc: "CommandCode (CC) models — use the model ID directly", color: "text-blue-400", example: `"model": "zai-org/GLM-5"` },
            { prefix: "rc:/channel|model", desc: "RightCode (RC) models — channel + model name", color: "text-purple-400", example: `"model": "rc:/codex-pro|gpt-5.4"` },
            { prefix: "ag:model-id", desc: "AiGoCode (AG) models — prefix with ag:", color: "text-green-400", example: `"model": "ag:gpt-4o"` },
          ].map(row => (
            <div key={row.prefix} className="bg-black/30 border border-white/[0.06] rounded-lg px-4 py-3 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <code className={`font-mono text-xs ${row.color}`}>{row.prefix}</code>
              </div>
              <p className="text-xs text-white/40">{row.desc}</p>
              <code className="text-[10px] text-white/25 font-mono">{row.example}</code>
            </div>
          ))}
        </div>
        <p className="text-xs text-white/40">
          Browse available models via <code className="text-[#f97316] font-mono">GET {modelsUrl}</code> (CC) or <code className="text-[#f97316] font-mono">GET {rcModelsUrl}</code> (RC).
        </p>
      </DocSection>

      {/* Streaming Example */}
      <DocSection title="⚡ Streaming (SSE)">
        <p className="text-xs text-white/50 leading-relaxed">
          The endpoint streams Server-Sent Events (SSE). Each chunk is a JSON object with a <code className="text-[#f97316] font-mono">text</code> delta. The stream ends with <code className="text-[#f97316] font-mono">[DONE]</code>.
        </p>
        <CodeBlock lang="javascript" code={`// Node.js / Browser — fetch with streaming
const res = await fetch("${streamUrl}", {
  method: "POST",
  headers: {
    "X-Api-Key": "${key}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "zai-org/GLM-5",
    messages: [{ role: "user", content: "Write a haiku about APIs." }],
    stream: true,
  }),
});

const reader = res.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const lines = decoder.decode(value).split("\\n");
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const data = line.slice(6).trim();
    if (data === "[DONE]") break;
    const json = JSON.parse(data);
    process.stdout.write(json.text ?? "");
  }
}`} />
      </DocSection>

      {/* Claude Code */}
      <DocSection title="🤖 Claude Code" defaultOpen={false}>
        <ClaudeCodeSection apiKey={key} base={BASE} />
      </DocSection>

      {/* Codex CLI */}
      <DocSection title="⌨️ Codex CLI" defaultOpen={false}>
        <CodexSection apiKey={key} base={BASE} />
      </DocSection>

      {/* Cursor / VS Code */}
      <DocSection title="🖱️ Cursor / Continue.dev / VS Code" defaultOpen={false}>
        <p className="text-xs text-white/50 leading-relaxed">
          أي أداة تدعم custom OpenAI endpoint يمكن توصيلها. اضبط:
        </p>
        <div className="space-y-3">
          <div>
            <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Cursor — settings.json</p>
            <CodeBlock lang="json" code={`{
  "openai.apiKey": "${key}",
  "openai.baseUrl": "${BASE}/api/proxy/codex",
  "openai.model": "gpt-5.4"
}`} />
          </div>
          <div>
            <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Continue.dev — config.json</p>
            <CodeBlock lang="json" code={`{
  "models": [
    {
      "title": "CommandCode via RC",
      "provider": "openai",
      "model": "gpt-5.4",
      "apiKey": "${key}",
      "apiBase": "${BASE}/api/proxy/codex"
    },
    {
      "title": "CommandCode Claude",
      "provider": "anthropic",
      "model": "claude-sonnet-4-5",
      "apiKey": "${key}",
      "apiBase": "${BASE}/api/proxy/claude"
    }
  ]
}`} />
          </div>
        </div>
      </DocSection>

      {/* Python example */}
      <DocSection title="🐍 Python" defaultOpen={false}>
        <CodeBlock lang="python" code={`import httpx, json

API_KEY = "${key}"
URL     = "${streamUrl}"

payload = {
    "model": "zai-org/GLM-5",
    "messages": [{"role": "user", "content": "Explain async/await briefly."}],
    "stream": True,
}

with httpx.stream(
    "POST", URL,
    headers={"X-Api-Key": API_KEY, "Content-Type": "application/json"},
    json=payload,
    timeout=60,
) as r:
    for line in r.iter_lines():
        if not line.startswith("data: "):
            continue
        data = line[6:].strip()
        if data == "[DONE]":
            break
        chunk = json.loads(data)
        print(chunk.get("text", ""), end="", flush=True)`} />
      </DocSection>

      {/* OpenAI SDK compat */}
      <DocSection title="🔧 OpenAI SDK (beta)" defaultOpen={false}>
        <p className="text-xs text-white/50 leading-relaxed">
          For CC models you can use the OpenAI Python/JS SDK by pointing <code className="text-[#f97316] font-mono">base_url</code> to the stream endpoint and using your CC key.
          Note: the response format is SSE text-delta, not full OpenAI chunks, so use the raw streaming approach above for best compatibility.
        </p>
        <CodeBlock lang="python" code={`from openai import OpenAI

client = OpenAI(
    api_key="${key}",
    base_url="${BASE}/api/",
)

# Non-streaming example (wraps internally)
# For streaming, use the native fetch/httpx approach above.
response = client.chat.completions.create(
    model="zai-org/GLM-5",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=False,
)`} />
      </DocSection>

      {/* Rate limits */}
      <DocSection title="⏱ Rate Limits & Errors" defaultOpen={false}>
        <div className="space-y-3">
          <p className="text-xs text-white/50 leading-relaxed">
            Each API key has a per-minute request limit (RPM). Exceeding it returns <code className="text-[#f97316] font-mono">HTTP 429</code> with a <code className="text-[#f97316] font-mono">Retry-After</code> header indicating seconds to wait.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-white/30 uppercase tracking-wider border-b border-white/[0.06]">
                  <th className="text-left py-2 pr-4 font-medium">HTTP Status</th>
                  <th className="text-left py-2 pr-4 font-medium">Meaning</th>
                  <th className="text-left py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {[
                  ["200", "Success (streaming)", "Read SSE chunks"],
                  ["400", "Bad request", "Check model ID and message format"],
                  ["403", "Invalid / disabled key", "Verify API key in dashboard"],
                  ["429", "Rate limit exceeded", "Wait Retry-After seconds"],
                  ["503", "No keys in pool", "Contact support"],
                ].map(([code, meaning, action]) => (
                  <tr key={code} className="text-white/50">
                    <td className="py-2 pr-4 font-mono">{code}</td>
                    <td className="py-2 pr-4">{meaning}</td>
                    <td className="py-2 text-white/30">{action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </DocSection>

      {/* Response format */}
      <DocSection title="📦 Response Format" defaultOpen={false}>
        <p className="text-xs text-white/50 leading-relaxed">
          Each SSE data line carries a JSON object. The only field you need is <code className="text-[#f97316] font-mono">text</code> — concatenate all deltas to build the full response.
        </p>
        <CodeBlock lang="json" code={`// Each streaming chunk:
{ "type": "text-delta", "text": "Hello" }
{ "type": "text-delta", "text": " world" }
{ "type": "text-delta", "text": "!" }

// End of stream marker:
[DONE]

// Error response (non-200):
{ "error": "Rate limit exceeded — max 60 requests/minute for this key" }`} />
      </DocSection>
    </div>
  );
}

// ── MAIN DASHBOARD ────────────────────────────────────────────────────────────
const NAV = [
  { icon: Home, label: "Home", id: "home" },
  { icon: LayoutDashboard, label: "Dashboard", id: "dashboard" },
  { icon: FileText, label: "Usage Logs", id: "logs" },
  { icon: Key, label: "API Keys", id: "keys" },
  { icon: Cpu, label: "Models", id: "models" },
  { icon: BookOpen, label: "Docs", id: "docs" },
  { icon: CreditCard, label: "Subscribe", id: "subscribe" },
  { icon: MessageSquare, label: "Online Chat", id: "chat" },
  { icon: Users, label: "Invite", id: "invite" },
  { icon: Phone, label: "Contact", id: "contact" },
];

export default function UserDashboard() {
  const { user } = useUser();
  const [collapsed, setCollapsed] = useState(false);
  const [nav, setNav] = useState("home");
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [range, setRange] = useState<Range>("today");
  const [keys, setKeys] = useState<UserKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);

  const loadKeys = useCallback(async () => {
    setKeysLoading(true);
    const res = await apiFetch<{ keys: UserKey[] }>("/api/user/keys");
    setKeys(res?.keys ?? []);
    setKeysLoading(false);
  }, []);

  const loadStats = useCallback(async (r: Range) => {
    setStatsLoading(true);
    const data = await apiFetch<Stats>(`/api/user/stats?range=${r}`);
    setStats(data);
    setStatsLoading(false);
  }, []);

  useEffect(() => { loadKeys(); }, [loadKeys]);
  useEffect(() => { loadStats(range); }, [range, loadStats]);

  const handleNav = (id: string) => {
    if (id === "chat") { window.open("/chat", "_blank"); return; }
    setNav(id);
  };

  const navLabel = NAV.find(n => n.id === nav)?.label ?? nav;

  return (
    <div className="flex h-screen bg-[#0c0c10] text-white font-sans overflow-hidden"
      style={{ background: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(249,115,22,0.08) 0%, transparent 60%), #0c0c10" }}>
      {/* Sidebar */}
      <aside className={`flex flex-col border-r border-white/[0.07] transition-all duration-300 ${collapsed ? "w-16" : "w-56"} shrink-0`}>
        <div className={`flex items-center gap-2 px-4 py-5 border-b border-white/[0.07] ${collapsed ? "justify-center" : ""}`}>
          {collapsed
            ? <span className="text-[#f97316] font-bold text-lg font-mono">&gt;_</span>
            : <span className="text-[#f97316] font-bold text-lg tracking-tight font-mono">&gt;_ <span className="text-white">CommandCode</span></span>}
        </div>
        <nav className="flex-1 py-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ icon: Icon, label, id }) => (
            <button key={id} onClick={() => handleNav(id)}
              className={`w-full flex items-center gap-3 py-2.5 text-sm transition-colors ${collapsed ? "justify-center px-0" : "px-4"} ${nav === id ? "bg-[#f97316]/10 text-[#f97316] border-r-2 border-[#f97316]" : "text-white/45 hover:text-white hover:bg-white/[0.04]"}`}>
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </button>
          ))}
        </nav>
        <button onClick={() => setCollapsed(v => !v)}
          className="flex items-center justify-center p-3 border-t border-white/[0.07] text-white/30 hover:text-white transition-colors">
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-6 py-3.5 border-b border-white/[0.07] shrink-0">
          <span className="text-sm text-white/40">{navLabel}</span>
          <div className="flex items-center gap-3">
            <button onClick={() => { loadStats(range); loadKeys(); }} disabled={statsLoading}
              className="p-1.5 rounded text-white/30 hover:text-white hover:bg-white/5 transition-colors">
              <RefreshCw className={`w-4 h-4 ${statsLoading ? "animate-spin" : ""}`} />
            </button>
            <div className="flex items-center gap-2 pl-3 border-l border-white/[0.07]">
              <span className="text-xs text-white/40 hidden sm:block">{user?.primaryEmailAddress?.emailAddress}</span>
              <UserButton />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {nav === "home" && <HomePage stats={stats} keyCount={keys.length} loading={statsLoading} range={range} onRange={r => setRange(r)} />}
          {nav === "dashboard" && <DashboardPage stats={stats} loading={statsLoading} range={range} onRange={r => setRange(r)} />}
          {nav === "logs" && <UsageLogsPage />}
          {nav === "keys" && <ApiKeysPage keys={keys} loadingKeys={keysLoading} onRefresh={loadKeys} />}
          {nav === "models" && <ModelsPage />}
          {nav === "docs" && <DocsPage apiKey={keys[0]?.key ?? ""} />}
          {nav === "subscribe" && <SubscribePage />}
          {nav === "invite" && <InvitePage userId={user?.id ?? "00000000"} />}
          {nav === "contact" && <ContactPage />}
        </main>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { useUser, UserButton } from "@clerk/react";
import {
  Home, LayoutDashboard, FileText, Key, Cpu, CreditCard, MessageSquare,
  Users, Phone, ChevronLeft, ChevronRight, RefreshCw, Copy, Check,
  Search, ExternalLink, Bell, Globe, Shield,
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
  keyLabel: string; keyMasked: string; keyActive: boolean; keyCreatedAt: string;
};
type Log = { id: string; model: string; status: string; elapsedMs: number | null; createdAt: string };
type LogsResponse = { total: number; page: number; pageSize: number; logs: Log[] };
type Range = "today" | "7d" | "30d";

const STORAGE_KEY = "cc_user_api_key";
const ANNOUNCEMENTS = [
  { date: "1 days ago", pinned: true, text: "Platform update: New CC models added including DeepSeek-V3 and Qwen 2.5-Max. Enjoy faster response times with optimized routing." },
  { date: "2 days ago", pinned: true, text: "Right Code /claude channel maintenance window completed. Service fully restored with improved stability." },
  { date: "3 days ago", pinned: false, text: "API key rotation reminder: For security, we recommend rotating your API keys every 90 days." },
];

// ── API helpers ────────────────────────────────────────────────────────────────
async function apiFetch<T>(path: string, apiKey: string): Promise<T | null> {
  try {
    const res = await fetch(path, { headers: { "X-Api-Key": apiKey } });
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

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <button onClick={copy} className="p-1 text-white/30 hover:text-white/70 transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ── Key setup overlay ─────────────────────────────────────────────────────────
function KeySetup({ onSave }: { onSave: (k: string) => void }) {
  const [input, setInput] = useState("");
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8 w-full max-w-md text-center space-y-4">
        <div className="w-12 h-12 bg-[#f97316]/10 rounded-xl flex items-center justify-center mx-auto">
          <Key className="w-6 h-6 text-[#f97316]" />
        </div>
        <h2 className="text-lg font-bold text-white">Enter Your API Key</h2>
        <p className="text-sm text-white/50">Enter your <code className="text-[#f97316] font-mono">sk-cc-*</code> key provided by the platform admin to access your dashboard.</p>
        <div className="flex gap-2">
          <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && input.trim() && onSave(input.trim())}
            placeholder="sk-cc-..." className="flex-1 bg-white/5 border-white/10 text-white font-mono text-sm placeholder:text-white/20 focus:border-[#f97316]/50" />
          <Button onClick={() => input.trim() && onSave(input.trim())} disabled={!input.trim()} className="bg-[#f97316] hover:bg-[#ea6c0f] border-0 text-white shrink-0">Save</Button>
        </div>
      </div>
    </div>
  );
}

// ── HOME PAGE ─────────────────────────────────────────────────────────────────
function HomePage({ stats, loading, range, onRange }: { stats: Stats | null; loading: boolean; range: Range; onRange: (r: Range) => void }) {
  const val = (n: number) => loading ? "..." : String(n);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">Home</h1>
        <RangeTabs value={range} onChange={onRange} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard dot="bg-blue-400" label="Today's Requests" value={val(stats?.todayRequests ?? 0)} icon={<FileText className="w-4 h-4 text-blue-400/50" />} />
        <StatCard dot="bg-green-400" label="Total Requests" value={val(stats?.totalRequests ?? 0)} icon={<LayoutDashboard className="w-4 h-4 text-green-400/50" />} />
        <StatCard dot="bg-purple-400" label="Today's Tokens" value={val(0)} icon={<Cpu className="w-4 h-4 text-purple-400/50" />} />
        <StatCard dot="bg-orange-400" label="Total Tokens" value="0" icon={<Cpu className="w-4 h-4 text-orange-400/50" />} />
        <StatCard dot="bg-yellow-400" label="Today's Cost" value="$0.00" icon={<CreditCard className="w-4 h-4 text-yellow-400/50" />} />
        <StatCard dot="bg-red-400" label="Total Cost" value="$0.00" icon={<CreditCard className="w-4 h-4 text-red-400/50" />} />
        <StatCard dot="bg-cyan-400" label="My API Keys" value={stats ? "1" : "0"} icon={<Key className="w-4 h-4 text-cyan-400/50" />} />
        <StatCard dot="bg-pink-400" label="Total Invites" value="0" icon={<Users className="w-4 h-4 text-pink-400/50" />} />
      </div>
      {/* Announcements */}
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
  const val = (n: number) => loading ? "..." : String(n);
  const COLORS = ["#f97316", "#8b5cf6", "#06b6d4", "#22c55e", "#ec4899", "#eab308"];
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">Dashboard</h1>
        <div className="flex items-center gap-3">
          <RangeTabs value={range} onChange={onRange} />
        </div>
      </div>
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard dot="bg-green-400" label="Balance" value="$0.00" />
        <StatCard dot="bg-orange-400" label="Total Cost" value="$0.00" />
        <StatCard dot="bg-blue-400" label="Total Tokens" value="0" />
        <StatCard dot="bg-red-400" label="Total Requests" value={val(stats?.rangeRequests ?? 0)} />
      </div>
      {/* Rate Limits */}
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
      {/* Charts */}
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
          ) : <EmptyChart text="No model usage data available for analysis." />}
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
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Token Trend</h3>
        <EmptyChart text="No trend data available for visualization." />
      </div>
    </div>
  );
}

// ── USAGE LOGS PAGE ───────────────────────────────────────────────────────────
function UsageLogsPage({ apiKey }: { apiKey: string }) {
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
    const res = await apiFetch<LogsResponse>(`/api/user/logs?${params}`, apiKey);
    setData(res);
    setLoading(false);
  }, [apiKey, range, page, modelFilter, statusFilter]);

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
      {/* Filters */}
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/50 font-medium uppercase tracking-wider">Filters</span>
          <span className="text-xs bg-[#f97316]/20 text-[#f97316] px-1.5 py-0.5 rounded">1</span>
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
      {/* Table */}
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
                  <p className="font-medium text-sm">No data</p>
                  <p className="text-white/20 mt-1">No usage logs found</p>
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
function ApiKeysPage({ stats }: { stats: Stats | null }) {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-white">API Keys</h1>
      <div className="grid grid-cols-3 gap-4">
        <StatCard dot="bg-orange-400" label="Total Keys" value={stats ? "1" : "0"} />
        <StatCard dot="bg-green-400" label="Active" value={stats?.keyActive ? "1" : "0"} />
        <StatCard dot="bg-yellow-400" label="Inactive" value={stats?.keyActive === false ? "1" : "0"} />
      </div>
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input placeholder="Search keys…" className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/20" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06] text-white/40 uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">Key Name</th>
                <th className="text-left px-4 py-3 font-medium">Key</th>
                <th className="text-left px-4 py-3 font-medium">Usage</th>
                <th className="text-left px-4 py-3 font-medium">Created At</th>
                <th className="text-left px-4 py-3 font-medium">Expire At</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!stats ? (
                <tr><td colSpan={7} className="text-center py-12 text-white/30">No API keys found</td></tr>
              ) : (
                <tr className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-white/80 font-medium">{stats.keyLabel}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 font-mono text-white/60">
                      {stats.keyMasked}
                      <CopyBtn text={stats.keyMasked} />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1 w-28">
                      <div className="flex justify-between text-white/40"><span>{stats.totalRequests}</span><span>∞</span></div>
                      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-[#f97316] rounded-full" style={{ width: stats.totalRequests > 0 ? "20%" : "0%" }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white/40">{new Date(stats.keyCreatedAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-white/40">Never Expires</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${stats.keyActive ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                      {stats.keyActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button className="text-[10px] bg-white/5 hover:bg-white/10 px-2 py-1 rounded text-white/60 transition-colors">Import</button>
                      <button className="text-[10px] bg-white/5 hover:bg-white/10 px-2 py-1 rounded text-white/60 transition-colors">Docs</button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
      <p className="text-xs text-white/30 text-center">Model IDs use format: <code className="text-[#f97316]">rc:&#123;channel&#125;|&#123;model&#125;</code> — e.g. <code className="text-[#f97316]">rc:/codex-pro|gpt-5.4</code></p>
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
          <p className="text-xs text-white/30 mt-2">$1 balance = ¥1.00 &nbsp;·&nbsp; Minimum $1 per top-up</p>
        </div>
        <div className="flex justify-end pt-2 border-t border-white/[0.06]">
          <span className="text-2xl font-bold text-red-400">¥ {parseFloat(amount || "0").toFixed(2)}</span>
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
            <button className="text-sm text-white/40 hover:text-white/70 transition-colors">Rebates</button>
          </div>
        </div>
        <div className="overflow-x-auto">
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

// ── MAIN DASHBOARD ────────────────────────────────────────────────────────────
const NAV = [
  { icon: Home, label: "Home", id: "home" },
  { icon: LayoutDashboard, label: "Dashboard", id: "dashboard" },
  { icon: FileText, label: "Usage Logs", id: "logs" },
  { icon: Key, label: "API Keys", id: "keys" },
  { icon: Cpu, label: "Models", id: "models" },
  { icon: CreditCard, label: "Subscribe", id: "subscribe" },
  { icon: MessageSquare, label: "Online Chat", id: "chat" },
  { icon: Users, label: "Invite", id: "invite" },
  { icon: Phone, label: "Contact", id: "contact" },
];

export default function UserDashboard() {
  const { user } = useUser();
  const [collapsed, setCollapsed] = useState(false);
  const [nav, setNav] = useState("home");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(STORAGE_KEY) ?? "");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [range, setRange] = useState<Range>("today");

  const loadStats = useCallback(async (key: string, r: Range) => {
    if (!key) return;
    setLoading(true);
    const data = await apiFetch<Stats>(`/api/user/stats?range=${r}`, key);
    setLoading(false);
    if (!data) { setKeyError("Invalid or inactive API key"); setStats(null); }
    else { setKeyError(""); setStats(data); }
  }, []);

  useEffect(() => { if (apiKey) loadStats(apiKey, range); }, [apiKey, range, loadStats]);

  const saveKey = (k: string) => {
    localStorage.setItem(STORAGE_KEY, k);
    setApiKey(k);
    setKeyError("");
  };

  const handleNav = (id: string) => {
    if (id === "chat") { window.location.href = "/chat"; return; }
    setNav(id);
  };

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
        {/* Topbar */}
        <header className="flex items-center justify-between px-6 py-3.5 border-b border-white/[0.07] shrink-0">
          <span className="text-sm text-white/40 capitalize">{nav}</span>
          <div className="flex items-center gap-3">
            {apiKey && !keyError && (
              <button onClick={() => loadStats(apiKey, range)} disabled={loading}
                className="p-1.5 rounded text-white/30 hover:text-white hover:bg-white/5 transition-colors">
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            )}
            {keyError && apiKey && (
              <button onClick={() => { localStorage.removeItem(STORAGE_KEY); setApiKey(""); setStats(null); setKeyError(""); }}
                className="text-xs text-red-400 border border-red-500/20 px-2 py-1 rounded">Change Key</button>
            )}
            <div className="flex items-center gap-2 pl-3 border-l border-white/[0.07]">
              <span className="text-xs text-white/40 hidden sm:block">{user?.primaryEmailAddress?.emailAddress}</span>
              <UserButton />
            </div>
          </div>
        </header>

        {/* Page content */}
        {!apiKey ? (
          <KeySetup onSave={saveKey} />
        ) : (
          <main className="flex-1 overflow-y-auto p-6">
            {nav === "home" && <HomePage stats={stats} loading={loading} range={range} onRange={r => { setRange(r); loadStats(apiKey, r); }} />}
            {nav === "dashboard" && <DashboardPage stats={stats} loading={loading} range={range} onRange={r => { setRange(r); loadStats(apiKey, r); }} />}
            {nav === "logs" && <UsageLogsPage apiKey={apiKey} />}
            {nav === "keys" && <ApiKeysPage stats={stats} />}
            {nav === "models" && <ModelsPage />}
            {nav === "subscribe" && <SubscribePage />}
            {nav === "invite" && <InvitePage userId={user?.id ?? "00000000"} />}
            {nav === "contact" && <ContactPage />}
          </main>
        )}
      </div>
    </div>
  );
}

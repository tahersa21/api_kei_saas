import { useState, useEffect } from "react";
import { useUser, UserButton } from "@clerk/react";
import {
  LayoutDashboard, FileText, Key, Cpu, CreditCard, MessageSquare,
  Users, Phone, ChevronLeft, ChevronRight, RefreshCw, CalendarDays,
  TrendingUp, Zap, Activity, Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "cc_user_api_key";

type Stats = {
  totalRequests: number;
  requestsToday: number;
  requestsWeek: number;
  topModels: { model: string; count: number }[];
  recentLogs: { model: string; status: string; elapsedMs: number | null; createdAt: string }[];
};

async function fetchStats(apiKey: string): Promise<Stats | null> {
  try {
    const res = await fetch("/api/user/stats", {
      headers: { "X-Api-Key": apiKey },
    });
    if (!res.ok) return null;
    return await res.json() as Stats;
  } catch {
    return null;
  }
}

const NAV_ITEMS = [
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
  const [activeNav, setActiveNav] = useState("dashboard");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(STORAGE_KEY) ?? "");
  const [keyInput, setKeyInput] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [dateRange] = useState(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const fmt = (d: Date) =>
      `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return `${fmt(start)} — ${fmt(end)}`;
  });

  const loadStats = async (key: string) => {
    if (!key) return;
    setLoading(true);
    const data = await fetchStats(key);
    setLoading(false);
    if (!data) {
      setKeyError("Invalid API key");
      setStats(null);
    } else {
      setKeyError("");
      setStats(data);
    }
  };

  useEffect(() => {
    if (apiKey) loadStats(apiKey);
  }, [apiKey]);

  const saveKey = () => {
    const k = keyInput.trim();
    if (!k) return;
    localStorage.setItem(STORAGE_KEY, k);
    setApiKey(k);
    setKeyInput("");
  };

  return (
    <div className="flex h-screen bg-[#0d0d0d] text-white font-sans overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-white/10 transition-all duration-300 ${collapsed ? "w-16" : "w-56"} shrink-0`}
      >
        {/* Logo */}
        <div className={`flex items-center gap-2 px-4 py-5 border-b border-white/10 ${collapsed ? "justify-center" : ""}`}>
          {!collapsed && (
            <span className="text-[#f97316] font-bold text-lg tracking-tight font-mono">
              &gt;_ <span className="text-white">CommandCode</span>
            </span>
          )}
          {collapsed && <span className="text-[#f97316] font-bold text-lg">&gt;_</span>}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-0.5">
          {NAV_ITEMS.map(({ icon: Icon, label, id }) => (
            <button
              key={id}
              onClick={() => setActiveNav(id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                activeNav === id
                  ? "bg-[#f97316]/15 text-[#f97316] border-r-2 border-[#f97316]"
                  : "text-white/50 hover:text-white hover:bg-white/5"
              } ${collapsed ? "justify-center px-0" : ""}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </button>
          ))}
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(v => !v)}
          className="flex items-center justify-center p-3 border-t border-white/10 text-white/40 hover:text-white transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <CalendarDays className="w-4 h-4 text-white/40" />
            <span className="text-sm text-white/50 font-mono">{dateRange}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              {["Today", "7 days", "30 days"].map((d, i) => (
                <button
                  key={d}
                  className={`px-3 py-1 text-xs rounded transition-colors ${
                    i === 0
                      ? "bg-[#f97316] text-white font-semibold"
                      : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <button
              onClick={() => apiKey && loadStats(apiKey)}
              disabled={loading}
              className="p-1.5 rounded text-white/40 hover:text-white hover:bg-white/5 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <div className="flex items-center gap-2 pl-2 border-l border-white/10">
              <span className="text-sm text-white/60">{user?.primaryEmailAddress?.emailAddress}</span>
              <UserButton />
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* API Key Setup */}
          {!apiKey && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-white mb-1">Set Your API Key</h3>
              <p className="text-xs text-white/50 mb-4">Enter your <code className="text-[#f97316]">sk-cc-*</code> API key to view your usage stats</p>
              <div className="flex gap-2">
                <input
                  value={keyInput}
                  onChange={e => setKeyInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && saveKey()}
                  placeholder="sk-cc-..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-[#f97316]/50"
                />
                <Button onClick={saveKey} disabled={!keyInput.trim()} className="bg-[#f97316] hover:bg-[#ea6c0f] text-white border-0">
                  Save Key
                </Button>
              </div>
              {keyError && <p className="text-xs text-red-400 mt-2">{keyError}</p>}
            </div>
          )}

          {apiKey && keyError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center justify-between">
              <p className="text-sm text-red-400">{keyError} — Your API key may be invalid or revoked.</p>
              <button onClick={() => { localStorage.removeItem(STORAGE_KEY); setApiKey(""); setStats(null); setKeyError(""); }}
                className="text-xs text-white/40 hover:text-white">Change Key</button>
            </div>
          )}

          {/* Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              dot="bg-green-400"
              label="BALANCE"
              value="$0.00"
              icon={<CreditCard className="w-5 h-5 text-green-400/60" />}
            />
            <StatCard
              dot="bg-orange-400"
              label="TOTAL COST"
              value="$0.00"
              icon={<TrendingUp className="w-5 h-5 text-orange-400/60" />}
            />
            <StatCard
              dot="bg-blue-400"
              label="TOTAL TOKENS"
              value={loading ? "..." : String(stats?.totalRequests != null ? "N/A" : 0)}
              icon={<Zap className="w-5 h-5 text-blue-400/60" />}
            />
            <StatCard
              dot="bg-red-400"
              label="TOTAL REQUESTS"
              value={loading ? "..." : String(stats?.totalRequests ?? 0)}
              icon={<Activity className="w-5 h-5 text-red-400/60" />}
            />
          </div>

          {/* Rate Limits & Models */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top Models */}
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Hash className="w-4 h-4 text-white/40" />
                <h3 className="text-sm font-semibold text-white">Top Models</h3>
              </div>
              {!stats || stats.topModels.length === 0 ? (
                <p className="text-xs text-white/30 text-center py-6">No usage data yet</p>
              ) : (
                <div className="space-y-3">
                  {stats.topModels.slice(0, 6).map(({ model, count }) => (
                    <div key={model} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-white/70 font-mono truncate">{model}</span>
                        <span className="text-white/40 ml-2">{count}</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#f97316] rounded-full"
                          style={{ width: `${Math.round((count / (stats.topModels[0]?.count || 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Logs */}
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-white/40" />
                <h3 className="text-sm font-semibold text-white">Recent Requests</h3>
              </div>
              {!stats || stats.recentLogs.length === 0 ? (
                <p className="text-xs text-white/30 text-center py-6">No requests yet</p>
              ) : (
                <div className="space-y-2">
                  {stats.recentLogs.slice(0, 6).map((log, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${log.status === "ok" ? "bg-green-400" : "bg-red-400"}`} />
                        <span className="text-xs text-white/70 font-mono truncate">{log.model}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-2">
                        {log.elapsedMs && (
                          <span className="text-xs text-white/30">{(log.elapsedMs / 1000).toFixed(1)}s</span>
                        )}
                        <span className="text-xs text-white/25">
                          {new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* API Key display */}
          {apiKey && !keyError && (
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-white/40" />
                  <h3 className="text-sm font-semibold text-white">Your API Key</h3>
                </div>
                <button
                  onClick={() => { localStorage.removeItem(STORAGE_KEY); setApiKey(""); setStats(null); }}
                  className="text-xs text-white/30 hover:text-white/60 transition-colors"
                >
                  Change
                </button>
              </div>
              <code className="text-sm font-mono text-[#f97316] bg-white/5 px-4 py-2 rounded-lg block">
                {apiKey.slice(0, 12)}{"•".repeat(Math.max(0, apiKey.length - 16))}{apiKey.slice(-4)}
              </code>
              <p className="text-xs text-white/30 mt-2">Use this key as <code>Authorization: Bearer YOUR_KEY</code> in your API requests</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function StatCard({ dot, label, value, icon }: { dot: string; label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dot}`} />
          <span className="text-xs text-white/40 tracking-widest uppercase">{label}</span>
        </div>
        {icon}
      </div>
      <span className="text-3xl font-bold text-white">{value}</span>
    </div>
  );
}

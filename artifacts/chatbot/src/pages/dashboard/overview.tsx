import { useEffect, useState, useCallback } from "react";
import { useAdminFetch } from "@/context/admin-auth";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Key, Users, Activity, TrendingUp, Loader2, Zap,
  Clock, CheckCircle2, RefreshCw, ArrowUp, ArrowDown, Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Stats = {
  ccKeys: { total: number; active: number };
  rcKeys: { total: number; active: number };
  userKeys: { total: number; active: number };
  requests: { total: number; today: number; yesterday: number; week: number };
  successRate: number;
  avgResponseMs: number | null;
  topModels: { model: string; count: number }[];
  topUserKeys: { label: string; count: number }[];
  timeSeries: { date: string; requests: number; errors: number; avgMs: number | null }[];
};

function formatMs(ms: number | null): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function shortDate(d: string): string {
  const [, m, day] = d.split("-");
  return `${parseInt(m)}/${parseInt(day)}`;
}

function TrendBadge({ now, prev }: { now: number; prev: number }) {
  if (prev === 0) return null;
  const diff = now - prev;
  const pct = Math.round(Math.abs(diff / prev) * 100);
  if (pct === 0) return null;
  return (
    <span className={`flex items-center gap-0.5 text-[10px] font-sans font-normal ${diff >= 0 ? "text-emerald-400" : "text-red-400"}`}>
      {diff >= 0 ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
      {pct}%
    </span>
  );
}

function StatCard({ icon: Icon, label, value, sub, color = "text-primary", trend }: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: string; color?: string; trend?: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border/50 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest">{label}</span>
        <Icon className={`w-4 h-4 ${color} opacity-60`} />
      </div>
      <div>
        <div className="flex items-end gap-2">
          <p className={`text-2xl font-bold ${color}`}>{value}</p>
          {trend}
        </div>
        {sub && <p className="text-[10px] text-muted-foreground font-sans mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const CHART_COLORS = {
  requests: "#7c3aed",
  errors: "#ef4444",
  models: ["#7c3aed", "#6d28d9", "#5b21b6", "#4c1d95", "#3b0764", "#2e1065", "#1e1b4b", "#1e3a8a"],
};

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "6px",
  fontSize: "11px",
  fontFamily: "var(--font-mono)",
  color: "hsl(var(--foreground))",
};

export default function DashboardOverview() {
  const apiFetch = useAdminFetch();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const load = useCallback(async () => {
    const res = await apiFetch("/api/admin/stats");
    const d = (await res.json()) as Stats;
    setStats(d);
    setLoading(false);
    setLastRefresh(new Date());
  }, [apiFetch]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!stats) return null;

  const totalModels = stats.topModels.reduce((s, m) => s + m.count, 0);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold tracking-tight">Overview</h1>
          <p className="text-[10px] text-muted-foreground font-sans mt-0.5">
            Last updated {lastRefresh.toLocaleTimeString()} · auto-refresh every 30s
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load} title="Refresh now">
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <StatCard icon={Activity} label="Today" value={stats.requests.today} color="text-primary"
          trend={<TrendBadge now={stats.requests.today} prev={stats.requests.yesterday} />}
          sub={`${stats.requests.yesterday} yesterday`} />
        <StatCard icon={TrendingUp} label="This Week" value={stats.requests.week} color="text-indigo-400"
          sub={`${stats.requests.total.toLocaleString()} total`} />
        <StatCard icon={CheckCircle2} label="Success Rate" value={`${stats.successRate}%`}
          color={stats.successRate >= 95 ? "text-emerald-400" : stats.successRate >= 80 ? "text-amber-400" : "text-red-400"}
          sub="of all requests" />
        <StatCard icon={Clock} label="Avg Response" value={formatMs(stats.avgResponseMs)} color="text-sky-400"
          sub="ok requests" />
        <StatCard icon={Key} label="CC Keys" value={stats.ccKeys.active} color="text-emerald-400"
          sub={`${stats.ccKeys.total} total`} />
        <StatCard icon={Server} label="RC Keys" value={(stats.rcKeys?.active ?? 0)} color="text-violet-400"
          sub={`${stats.rcKeys?.total ?? 0} total`} />
        <StatCard icon={Users} label="User Keys" value={stats.userKeys.active} color="text-blue-400"
          sub={`${stats.userKeys.total} total`} />
      </div>

      {/* Daily requests chart */}
      <div className="bg-card border border-border/50 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-primary/60" />
          <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Requests — Last 14 Days</span>
          <div className="ml-auto flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary/70 inline-block" />Requests
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500/70 inline-block" />Errors
            </span>
          </div>
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.timeSeries} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradReq" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradErr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => `Date: ${v}`} formatter={(v: number, name: string) => [v, name === "requests" ? "Requests" : "Errors"]} />
              <Area type="monotone" dataKey="requests" stroke={CHART_COLORS.requests} strokeWidth={1.5} fill="url(#gradReq)" dot={false} />
              <Area type="monotone" dataKey="errors" stroke={CHART_COLORS.errors} strokeWidth={1.5} fill="url(#gradErr)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Avg response time chart */}
      {stats.timeSeries.some((d) => d.avgMs !== null) && (
        <div className="bg-card border border-border/50 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-sky-400/60" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Avg Response Time — Last 14 Days</span>
          </div>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.timeSeries.filter((d) => d.avgMs !== null)} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradMs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}ms`} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => `Date: ${v}`} formatter={(v: number) => [`${v}ms`, "Avg Response"]} />
                <Area type="monotone" dataKey="avgMs" stroke="#38bdf8" strokeWidth={1.5} fill="url(#gradMs)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top models bar chart */}
        {stats.topModels.length > 0 && (
          <div className="bg-card border border-border/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-primary/60" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Top Models</span>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={stats.topModels.map((m) => ({ ...m, pct: Math.round((m.count / (totalModels || 1)) * 100) }))}
                  margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="model" width={110}
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }}
                    axisLine={false} tickLine={false}
                    tickFormatter={(v: string) => v.includes("/") ? v.split("/")[1] : v} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, "Requests"]} />
                  <Bar dataKey="count" fill="#7c3aed" fillOpacity={0.8} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Top user keys */}
        {stats.topUserKeys.length > 0 && (
          <div className="bg-card border border-border/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-blue-400/60" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Top Users</span>
            </div>
            <div className="space-y-2.5">
              {stats.topUserKeys.map((k, i) => {
                const pct = Math.round((k.count / (stats.requests.total || 1)) * 100);
                const maxCount = stats.topUserKeys[0]?.count ?? 1;
                const barPct = Math.round((k.count / maxCount) * 100);
                return (
                  <div key={k.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground/40 w-4 text-right text-[10px]">{i + 1}.</span>
                        <span className="font-sans text-[11px] truncate max-w-[140px]">{k.label}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground tabular-nums">
                        <span>{k.count.toLocaleString()}</span>
                        <span className="text-muted-foreground/40">{pct}%</span>
                      </div>
                    </div>
                    <div className="h-1 bg-muted/30 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500/50 rounded-full transition-all" style={{ width: `${barPct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

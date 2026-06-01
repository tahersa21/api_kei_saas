import { useEffect, useState, useCallback } from "react";
import { useAdminFetch } from "@/context/admin-auth";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

type LogEntry = {
  id: string;
  model: string;
  elapsedMs: number | null;
  status: string;
  errorMsg: string | null;
  createdAt: string;
  userKeyLabel: string | null;
  ccKeyLabel: string | null;
};

function formatMs(ms: number | null): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const PAGE_SIZE = 50;

export default function LogsPage() {
  const apiFetch = useAdminFetch();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    const res = await apiFetch(`/api/admin/logs?limit=${PAGE_SIZE}&offset=${p * PAGE_SIZE}`);
    const data = (await res.json()) as { logs: LogEntry[]; total: number };
    setLogs(data.logs ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [apiFetch]);

  useEffect(() => { load(page); }, [load, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold tracking-tight">Request Logs</h1>
          <p className="text-[10px] text-muted-foreground font-sans mt-0.5">{total.toLocaleString()} total requests logged</p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => load(page)}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-xs">No requests logged yet</p>
        </div>
      ) : (
        <>
          <div className="border border-border/50 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50 bg-card/50">
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground font-normal">Time</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground font-normal">Status</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground font-normal">Model</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground font-normal">User Key</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground font-normal">CC Key</th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground font-normal">Duration</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr key={log.id} className={`border-b border-border/30 hover:bg-card/30 transition-colors ${i % 2 === 0 ? "" : "bg-card/10"}`}>
                    <td className="px-3 py-2 text-[10px] text-muted-foreground font-sans whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      {log.status === "ok" ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <div title={log.errorMsg ?? ""}>
                          <XCircle className="w-3.5 h-3.5 text-destructive" />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground max-w-[180px] truncate">
                      {log.model}
                    </td>
                    <td className="px-3 py-2 text-[10px] text-muted-foreground font-sans">
                      {log.userKeyLabel ?? <span className="text-muted-foreground/30">—</span>}
                    </td>
                    <td className="px-3 py-2 text-[10px] text-muted-foreground font-sans">
                      {log.ccKeyLabel ?? <span className="text-muted-foreground/30">—</span>}
                    </td>
                    <td className="px-3 py-2 text-[10px] text-muted-foreground text-right tabular-nums">
                      {formatMs(log.elapsedMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="text-[10px] font-sans">Page {page + 1} of {totalPages}</span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

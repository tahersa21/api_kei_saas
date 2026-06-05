import { useEffect, useState, useCallback, useRef } from "react";
import { useAdminFetch } from "@/context/admin-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2, RefreshCw, Eye, EyeOff, Pencil, X, Check,
  DollarSign, ChevronDown, ChevronRight, Search,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ModelDef = {
  id: string;
  name: string;
  group: string;
  description?: string;
  tier?: string;
  provider?: string;
  price?: { input: number; output: number };
};

type ModelOverride = {
  hidden?: boolean;
  displayName?: string;
  price?: { input: number; output: number };
};

type ProviderTab = "cc" | "rc";

// ─── Inline Edit Row ──────────────────────────────────────────────────────────

function EditRow({
  model,
  override,
  onSave,
  onCancel,
}: {
  model: ModelDef;
  override: ModelOverride;
  onSave: (patch: ModelOverride) => Promise<void>;
  onCancel: () => void;
}) {
  const [displayName, setDisplayName] = useState(override.displayName ?? "");
  const [priceIn, setPriceIn] = useState(String(override.price?.input ?? model.price?.input ?? ""));
  const [priceOut, setPriceOut] = useState(String(override.price?.output ?? model.price?.output ?? ""));
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const save = async () => {
    setSaving(true);
    const patch: ModelOverride = {};
    if (displayName.trim()) patch.displayName = displayName.trim();
    else patch.displayName = undefined;
    const inp = parseFloat(priceIn);
    const out = parseFloat(priceOut);
    if (!isNaN(inp) && !isNaN(out)) patch.price = { input: inp, output: out };
    else if (priceIn === "" && priceOut === "") patch.price = undefined;
    await onSave(patch);
    setSaving(false);
  };

  return (
    <div ref={ref} className="px-3 py-2.5 bg-muted/10 border-b border-border/10 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground/40 mb-1">Display Name Override</p>
          <Input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder={model.name}
            className="h-7 text-xs bg-background/50"
            autoFocus
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground/40 mb-1">Input Price ($/1M tokens)</p>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={priceIn}
            onChange={e => setPriceIn(e.target.value)}
            placeholder="e.g. 1.00"
            className="h-7 text-xs bg-background/50"
          />
        </div>
        <div className="flex-1">
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground/40 mb-1">Output Price ($/1M tokens)</p>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={priceOut}
            onChange={e => setPriceOut(e.target.value)}
            placeholder="e.g. 3.00"
            className="h-7 text-xs bg-background/50"
          />
        </div>
        <div className="flex items-end gap-1.5 pb-0.5 mt-auto">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onCancel}>
            <X className="w-3 h-3" />
          </Button>
          <Button size="sm" className="h-7 px-3 text-xs gap-1" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Model Row ────────────────────────────────────────────────────────────────

function ModelRow({
  model,
  override,
  onToggleHide,
  onSaveOverride,
  onClearOverride,
}: {
  model: ModelDef;
  override: ModelOverride;
  onToggleHide: () => void;
  onSaveOverride: (patch: ModelOverride) => Promise<void>;
  onClearOverride: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const isHidden = override.hidden === true;
  const hasPrice = override.price ?? model.price;
  const hasCustomName = override.displayName;
  const hasAnyOverride = isHidden || hasPrice || hasCustomName;

  return (
    <div className={`transition-colors ${isHidden ? "opacity-40" : ""}`}>
      <div className="flex items-center gap-3 px-3 py-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium font-mono truncate">
              {override.displayName || model.name}
            </span>
            {override.displayName && (
              <span className="text-[9px] text-muted-foreground/50 font-mono truncate">({model.name})</span>
            )}
            {isHidden && (
              <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-muted/40 text-muted-foreground">hidden</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-muted-foreground/50 font-mono truncate">{model.id}</span>
            {hasPrice && (
              <span className="text-[9px] text-emerald-400/70 flex items-center gap-0.5">
                <DollarSign className="w-2.5 h-2.5" />
                {(override.price ?? model.price)!.input}/${(override.price ?? model.price)!.output}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-none">
          {hasAnyOverride && (
            <button
              onClick={() => void onClearOverride()}
              className="px-1.5 py-1 rounded text-[9px] text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors font-sans"
              title="Clear all overrides"
            >
              reset
            </button>
          )}
          <button
            onClick={() => setEditing(e => !e)}
            className="p-1.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/20 transition-colors"
            title="Edit name & price"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggleHide}
            className={`p-1.5 rounded transition-colors ${isHidden
              ? "text-muted-foreground/30 hover:text-foreground hover:bg-muted/20"
              : "text-emerald-500/70 hover:text-muted-foreground hover:bg-muted/20"}`}
            title={isHidden ? "Show model" : "Hide model"}
          >
            {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      {editing && (
        <EditRow
          model={model}
          override={override}
          onSave={async (patch) => { await onSaveOverride(patch); setEditing(false); }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}

// ─── Group Section ────────────────────────────────────────────────────────────

function GroupSection({
  group,
  models,
  overrides,
  onToggleHide,
  onSaveOverride,
  onClearOverride,
}: {
  group: string;
  models: ModelDef[];
  overrides: Record<string, ModelOverride>;
  onToggleHide: (id: string) => void;
  onSaveOverride: (id: string, patch: ModelOverride) => Promise<void>;
  onClearOverride: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(true);
  const hiddenCount = models.filter(m => overrides[m.id]?.hidden).length;

  return (
    <div className="border border-border/40 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-card/40 hover:bg-card/60 transition-colors text-left"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />}
        <span className="text-xs font-semibold">{group}</span>
        <span className="text-[9px] text-muted-foreground/50 font-sans ml-1">{models.length} models</span>
        {hiddenCount > 0 && (
          <span className="text-[9px] text-muted-foreground/40 font-sans ml-auto">
            {hiddenCount} hidden
          </span>
        )}
      </button>
      {open && (
        <div className="divide-y divide-border/10">
          {models.map(m => (
            <ModelRow
              key={m.id}
              model={m}
              override={overrides[m.id] ?? {}}
              onToggleHide={() => onToggleHide(m.id)}
              onSaveOverride={(patch) => onSaveOverride(m.id, patch)}
              onClearOverride={() => onClearOverride(m.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ModelsPage() {
  const apiFetch = useAdminFetch();
  const [ccModels, setCcModels] = useState<ModelDef[]>([]);
  const [rcModels, setRcModels] = useState<ModelDef[]>([]);
  const [overrides, setOverrides] = useState<Record<string, ModelOverride>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProviderTab>("cc");
  const [search, setSearch] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [ccRes, rcRes, ovRes] = await Promise.all([
      fetch("/api/chat/models"),
      fetch("/api/chat/rc-models"),
      apiFetch("/api/admin/model-overrides"),
    ]);
    if (ccRes.ok) {
      const d = await ccRes.json() as { models: ModelDef[] };
      setCcModels(d.models ?? []);
    }
    if (rcRes.ok) {
      const d = await rcRes.json() as { models: ModelDef[] };
      setRcModels(d.models ?? []);
    }
    if (ovRes.ok) {
      const d = await ovRes.json() as { overrides: Record<string, ModelOverride> };
      setOverrides(d.overrides ?? {});
    }
    setLoading(false);
  }, [apiFetch]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const toggleHide = async (id: string) => {
    const current = overrides[id]?.hidden ?? false;
    const res = await apiFetch(`/api/admin/model-overrides/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ hidden: !current }),
    });
    if (res.ok) {
      const d = await res.json() as { overrides: Record<string, ModelOverride> };
      setOverrides(d.overrides);
    }
  };

  const saveOverride = async (id: string, patch: ModelOverride) => {
    const res = await apiFetch(`/api/admin/model-overrides/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const d = await res.json() as { overrides: Record<string, ModelOverride> };
      setOverrides(d.overrides);
    }
  };

  const clearOverride = async (id: string) => {
    const res = await apiFetch(`/api/admin/model-overrides/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      const d = await res.json() as { overrides: Record<string, ModelOverride> };
      setOverrides(d.overrides);
    }
  };

  const models = activeTab === "cc" ? ccModels : rcModels;

  // Apply search filter (includes hidden models in admin)
  const allModels = models.map(m => ({
    ...m,
    _name: (overrides[m.id]?.displayName || m.name || "").toLowerCase(),
    _id: (m.id || "").toLowerCase(),
    _group: (m.group || "").toLowerCase(),
  }));
  const filtered = search.trim()
    ? allModels.filter(m =>
        m._id.includes(search.toLowerCase()) ||
        m._name.includes(search.toLowerCase()) ||
        m._group.includes(search.toLowerCase())
      )
    : allModels;

  // Group by model.group
  const grouped = filtered.reduce<Record<string, ModelDef[]>>((acc, m) => {
    const g = m.group || "Other";
    (acc[g] ??= []).push(m);
    return acc;
  }, {});

  const totalHidden = models.filter(m => overrides[m.id]?.hidden).length;
  const totalWithPrice = Object.values(overrides).filter(o => o.price).length;

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold tracking-tight">Models</h1>
          <p className="text-[10px] text-muted-foreground font-sans mt-0.5">
            Control visibility, display names, and pricing per model
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={loadAll} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4">
        <div className="text-center">
          <p className="text-lg font-bold font-mono">{models.length}</p>
          <p className="text-[9px] text-muted-foreground/50 font-sans uppercase tracking-wider">total</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold font-mono text-emerald-400">{models.length - totalHidden}</p>
          <p className="text-[9px] text-muted-foreground/50 font-sans uppercase tracking-wider">visible</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold font-mono text-muted-foreground/50">{totalHidden}</p>
          <p className="text-[9px] text-muted-foreground/50 font-sans uppercase tracking-wider">hidden</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold font-mono text-primary/70">{totalWithPrice}</p>
          <p className="text-[9px] text-muted-foreground/50 font-sans uppercase tracking-wider">priced</p>
        </div>
      </div>

      {/* Provider Tabs + Search */}
      <div className="flex items-center gap-3">
        <div className="flex border border-border/40 rounded-lg overflow-hidden text-xs">
          {(["cc", "rc"] as ProviderTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 font-mono transition-colors ${activeTab === tab ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/10"}`}
            >
              {tab === "cc" ? "CommandCode" : "RightCode"}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/40" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search models…"
            className="h-7 text-xs pl-7 bg-background/50"
          />
        </div>
      </div>

      {/* Model List */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-xs text-muted-foreground/50 font-sans">No models found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([group, items]) => (
            <GroupSection
              key={group}
              group={group}
              models={items}
              overrides={overrides}
              onToggleHide={toggleHide}
              onSaveOverride={saveOverride}
              onClearOverride={clearOverride}
            />
          ))}
        </div>
      )}

      <p className="text-[9px] text-muted-foreground/30 font-sans">
        Hidden models are removed from /chat/models and /chat/rc-models responses. Changes take effect immediately.
      </p>
    </div>
  );
}

import { useEffect, useState, useCallback } from "react";
import { useAdminFetch } from "@/context/admin-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save, Settings2, RefreshCw } from "lucide-react";

type Settings = {
  defaultRpmLimit: number;
  maxKeysPerUser: number;
  registrationsEnabled: boolean;
  siteName: string;
  maintenanceMode: boolean;
};

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? "bg-primary" : "bg-muted/50 border border-border/50"}`}
    >
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );
}

export default function SettingsPage() {
  const apiFetch = useAdminFetch();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch("/api/admin/settings");
    const data = await res.json() as Settings;
    setSettings(data);
    setDraft(data);
    setLoading(false);
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const res = await apiFetch("/api/admin/settings", {
      method: "PATCH",
      body: JSON.stringify(draft),
    });
    const updated = await res.json() as Settings;
    setSettings(updated);
    setDraft(updated);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const changed = JSON.stringify(draft) !== JSON.stringify(settings);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!draft) return null;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold tracking-tight">Settings</h1>
          <p className="text-[10px] text-muted-foreground font-sans mt-0.5">System-wide configuration</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" className="h-7 px-3 text-xs gap-1.5" onClick={save} disabled={!changed || saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saved ? "Saved!" : "Save"}
          </Button>
        </div>
      </div>

      {/* General */}
      <section className="space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          <Settings2 className="w-3 h-3" />General
        </p>
        <div className="border border-border/50 rounded-lg divide-y divide-border/30 bg-card/20">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-xs font-medium">Site Name</p>
              <p className="text-[10px] text-muted-foreground font-sans mt-0.5">Displayed in the admin panel header</p>
            </div>
            <Input
              value={draft.siteName}
              onChange={e => setDraft({ ...draft, siteName: e.target.value })}
              className="h-7 w-40 text-xs font-sans bg-background/50"
            />
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-xs font-medium">Maintenance Mode</p>
              <p className="text-[10px] text-muted-foreground font-sans mt-0.5">Block all incoming chat requests</p>
            </div>
            <Toggle value={draft.maintenanceMode} onChange={v => setDraft({ ...draft, maintenanceMode: v })} />
          </div>
        </div>
      </section>

      {/* Users & Keys */}
      <section className="space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Users & Keys</p>
        <div className="border border-border/50 rounded-lg divide-y divide-border/30 bg-card/20">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-xs font-medium">New Registrations</p>
              <p className="text-[10px] text-muted-foreground font-sans mt-0.5">Allow new users to sign up via Clerk</p>
            </div>
            <Toggle value={draft.registrationsEnabled} onChange={v => setDraft({ ...draft, registrationsEnabled: v })} />
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-xs font-medium">Max Keys per User</p>
              <p className="text-[10px] text-muted-foreground font-sans mt-0.5">Maximum API keys a single user can create</p>
            </div>
            <Input
              type="number"
              min={1}
              max={50}
              value={draft.maxKeysPerUser}
              onChange={e => setDraft({ ...draft, maxKeysPerUser: Number(e.target.value) })}
              className="h-7 w-20 text-xs font-sans bg-background/50 text-center"
            />
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-xs font-medium">Default RPM Limit</p>
              <p className="text-[10px] text-muted-foreground font-sans mt-0.5">Requests/minute applied to newly created user keys</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={1}
                max={10000}
                value={draft.defaultRpmLimit}
                onChange={e => setDraft({ ...draft, defaultRpmLimit: Number(e.target.value) })}
                className="h-7 w-20 text-xs font-sans bg-background/50 text-center"
              />
              <span className="text-[10px] text-muted-foreground">rpm</span>
            </div>
          </div>
        </div>
      </section>

      {changed && (
        <p className="text-[10px] text-amber-500/80 font-sans">You have unsaved changes</p>
      )}
    </div>
  );
}

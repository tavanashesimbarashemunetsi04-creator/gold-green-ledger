import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listSettings,
  updateSetting,
  bulkUpdateSettings,
  getSettingHistory,
  forceLogoutAllUsers,
  exportConfiguration,
  importConfiguration,
  restoreDefaults,
} from "@/lib/admin-settings.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Settings as SettingsIcon, Search, Save, Undo2, History, Pencil, AlertTriangle,
  Building, Banknote, Landmark, Gauge, Wallet, Clock, Shield, UserCog,
  CheckCircle2, Bell, FileBarChart, ScrollText, Server, ShieldAlert,
} from "lucide-react";
import { format } from "date-fns";

type Setting = {
  id: string;
  key: string;
  category: string;
  label: string;
  description: string | null;
  value: unknown;
  value_type: string;
  validation: Record<string, unknown>;
  sort_order: number;
  last_modified_at: string;
  last_modified_by: string | null;
  last_modified_by_name: string | null;
};

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettingsPage,
});

const CATEGORIES: { key: string; label: string; icon: any }[] = [
  { key: "organization", label: "Organization", icon: Building },
  { key: "currencies", label: "Currencies", icon: Banknote },
  { key: "banks", label: "Banks", icon: Landmark },
  { key: "limits", label: "Transaction Limits", icon: Gauge },
  { key: "float", label: "Float Management", icon: Wallet },
  { key: "sessions", label: "Teller Sessions", icon: Clock },
  { key: "security", label: "Security", icon: Shield },
  { key: "users", label: "User Management", icon: UserCog },
  { key: "approvals", label: "Approvals", icon: CheckCircle2 },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "reports", label: "Reports", icon: FileBarChart },
  { key: "audit", label: "Audit", icon: ScrollText },
  { key: "system", label: "System", icon: Server },
  { key: "danger", label: "Danger Zone", icon: ShieldAlert },
];

function AdminSettingsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSettings);
  const updateFn = useServerFn(updateSetting);
  const bulkFn = useServerFn(bulkUpdateSettings);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => listFn(),
  });

  const settings: Setting[] = (data?.settings ?? []) as Setting[];

  const [search, setSearch] = useState("");
  const [dirty, setDirty] = useState<Record<string, unknown>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<string>("organization");

  const dirtyCount = Object.keys(dirty).length;

  // Warn on tab close with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyCount > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirtyCount]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return settings;
    return settings.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.key.toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q),
    );
  }, [settings, search]);

  const byCategory = useMemo(() => {
    const m: Record<string, Setting[]> = {};
    for (const s of filtered) {
      (m[s.category] ??= []).push(s);
    }
    return m;
  }, [filtered]);

  const setDirtyValue = (key: string, value: unknown) =>
    setDirty((d) => ({ ...d, [key]: value }));

  const cancelEdit = (key: string) => {
    setEditing((e) => ({ ...e, [key]: false }));
    setDirty((d) => {
      const { [key]: _, ...rest } = d;
      return rest;
    });
  };

  const saveOne = async (s: Setting) => {
    if (!(s.key in dirty)) {
      setEditing((e) => ({ ...e, [s.key]: false }));
      return;
    }
    try {
      await updateFn({ data: { key: s.key, value: dirty[s.key] } });
      toast.success(`Saved ${s.label}`);
      setEditing((e) => ({ ...e, [s.key]: false }));
      setDirty((d) => {
        const { [s.key]: _, ...rest } = d;
        return rest;
      });
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save");
    }
  };

  const saveAll = async () => {
    const updates = Object.entries(dirty).map(([key, value]) => ({ key, value }));
    if (!updates.length) return;
    try {
      await bulkFn({ data: { updates } });
      toast.success(`Saved ${updates.length} setting${updates.length === 1 ? "" : "s"}`);
      setDirty({});
      setEditing({});
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save");
    }
  };

  const cancelAll = () => {
    setDirty({});
    setEditing({});
  };

  const saveSection = async (cat: string) => {
    const keys = (byCategory[cat] ?? []).map((s) => s.key).filter((k) => k in dirty);
    if (!keys.length) return;
    const updates = keys.map((k) => ({ key: k, value: dirty[k] }));
    try {
      await bulkFn({ data: { updates } });
      toast.success(`Saved ${updates.length} setting${updates.length === 1 ? "" : "s"}`);
      setDirty((d) => {
        const copy = { ...d };
        for (const k of keys) delete copy[k];
        return copy;
      });
      setEditing((e) => {
        const copy = { ...e };
        for (const k of keys) copy[k] = false;
        return copy;
      });
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save");
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <SettingsIcon className="h-7 w-7" />
            Admin Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure business rules, limits, banks, currencies, security policies, and system behavior.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {dirtyCount > 0 && (
            <Badge variant="outline" className="border-amber-500 text-amber-600">
              {dirtyCount} unsaved change{dirtyCount === 1 ? "" : "s"}
            </Badge>
          )}
          <Button variant="outline" onClick={cancelAll} disabled={!dirtyCount}>
            <Undo2 className="h-4 w-4 mr-1" /> Cancel All
          </Button>
          <Button onClick={saveAll} disabled={!dirtyCount}>
            <Save className="h-4 w-4 mr-1" /> Save All
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search settings by name, key, or description…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto justify-start">
          {CATEGORIES.map((c) => (
            <TabsTrigger key={c.key} value={c.key} className="gap-1.5">
              <c.icon className="h-3.5 w-3.5" />
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {CATEGORIES.map((c) => (
          <TabsContent key={c.key} value={c.key} className="space-y-4">
            {c.key === "danger" ? (
              <DangerZone />
            ) : (
              <CategoryPanel
                category={c}
                settings={byCategory[c.key] ?? []}
                isLoading={isLoading}
                dirty={dirty}
                editing={editing}
                setEditing={setEditing}
                setDirtyValue={setDirtyValue}
                cancelEdit={cancelEdit}
                saveOne={saveOne}
                saveSection={saveSection}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function CategoryPanel({
  category, settings, isLoading, dirty, editing, setEditing, setDirtyValue, cancelEdit, saveOne, saveSection,
}: {
  category: { key: string; label: string; icon: any };
  settings: Setting[];
  isLoading: boolean;
  dirty: Record<string, unknown>;
  editing: Record<string, boolean>;
  setEditing: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setDirtyValue: (k: string, v: unknown) => void;
  cancelEdit: (k: string) => void;
  saveOne: (s: Setting) => void;
  saveSection: (cat: string) => void;
}) {
  const sectionDirty = settings.some((s) => s.key in dirty);
  const Icon = category.icon;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" /> {category.label}
          </CardTitle>
          <CardDescription>Manage {category.label.toLowerCase()} settings.</CardDescription>
        </div>
        <Button size="sm" onClick={() => saveSection(category.key)} disabled={!sectionDirty}>
          <Save className="h-4 w-4 mr-1" /> Save Section
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && settings.length === 0 && (
          <p className="text-sm text-muted-foreground">No settings in this category.</p>
        )}
        {settings.map((s) => (
          <SettingRow
            key={s.key}
            setting={s}
            isEditing={!!editing[s.key]}
            dirtyValue={s.key in dirty ? dirty[s.key] : undefined}
            isDirty={s.key in dirty}
            onEdit={() => setEditing((e) => ({ ...e, [s.key]: true }))}
            onChange={(v) => setDirtyValue(s.key, v)}
            onCancel={() => cancelEdit(s.key)}
            onSave={() => saveOne(s)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function SettingRow({
  setting, isEditing, dirtyValue, isDirty, onEdit, onChange, onCancel, onSave,
}: {
  setting: Setting;
  isEditing: boolean;
  dirtyValue: unknown;
  isDirty: boolean;
  onEdit: () => void;
  onChange: (v: unknown) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const value = isDirty ? dirtyValue : setting.value;
  return (
    <div className="border rounded-lg p-4 space-y-3 bg-card">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Label className="font-medium">{setting.label}</Label>
            {isDirty && <Badge variant="outline" className="border-amber-500 text-amber-600">Unsaved</Badge>}
            <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{setting.key}</code>
          </div>
          {setting.description && (
            <p className="text-xs text-muted-foreground mt-1">{setting.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <HistoryButton settingKey={setting.key} label={setting.label} />
          {!isEditing ? (
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
              <Button size="sm" onClick={onSave}>Save</Button>
            </>
          )}
        </div>
      </div>

      <ValueEditor
        setting={setting}
        value={value}
        editing={isEditing}
        onChange={onChange}
      />

      <p className="text-[11px] text-muted-foreground">
        Last modified{" "}
        {setting.last_modified_at
          ? format(new Date(setting.last_modified_at), "PPp")
          : "—"}
        {setting.last_modified_by_name ? ` by ${setting.last_modified_by_name}` : ""}
      </p>
    </div>
  );
}

function ValueEditor({
  setting, value, editing, onChange,
}: { setting: Setting; value: unknown; editing: boolean; onChange: (v: unknown) => void }) {
  const v = setting.validation ?? {};
  const type = setting.value_type;

  if (!editing) {
    return <div className="text-sm font-mono bg-muted/40 rounded px-3 py-2 break-words">{renderDisplay(value, type)}</div>;
  }

  if (type === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <Switch checked={!!value} onCheckedChange={(c) => onChange(c)} />
        <span className="text-sm">{value ? "Enabled" : "Disabled"}</span>
      </div>
    );
  }

  if (type === "number") {
    return (
      <Input
        type="number"
        min={(v.min as number) ?? undefined}
        max={(v.max as number) ?? undefined}
        value={(value as number) ?? 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    );
  }

  if (type === "number_or_unlimited") {
    const isUnlimited = value === null;
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Switch checked={isUnlimited} onCheckedChange={(c) => onChange(c ? null : 0)} />
          <span className="text-xs text-muted-foreground">No Limit</span>
        </div>
        {!isUnlimited && (
          <Input
            type="number"
            className="max-w-[200px]"
            min={(v.min as number) ?? 0}
            value={(value as number) ?? 0}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        )}
      </div>
    );
  }

  if (type === "select" && Array.isArray(v.options)) {
    return (
      <Select value={String(value ?? "")} onValueChange={(val) => onChange(val)}>
        <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {(v.options as string[]).map((opt) => (
            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (type === "select_number" && Array.isArray(v.options)) {
    return (
      <Select value={String(value ?? "")} onValueChange={(val) => onChange(Number(val))}>
        <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {(v.options as number[]).map((opt) => (
            <SelectItem key={opt} value={String(opt)}>{opt}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (type === "string" && v.format === "time") {
    return <Input type="time" className="max-w-[180px]" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }

  if (type === "string") {
    if (typeof value === "string" && value.length > 80) {
      return <Textarea value={value} onChange={(e) => onChange(e.target.value)} />;
    }
    return <Input value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }

  // array & json: JSON textarea editor
  return (
    <JsonEditor value={value} onChange={onChange} />
  );
}

function JsonEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? null, null, 2));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setText(JSON.stringify(value ?? null, null, 2)); }, [value]);
  return (
    <div className="space-y-1">
      <Textarea
        className="font-mono text-xs min-h-[140px]"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const parsed = JSON.parse(e.target.value);
            setErr(null);
            onChange(parsed);
          } catch (ex: any) {
            setErr(ex?.message ?? "Invalid JSON");
          }
        }}
      />
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}

function renderDisplay(value: unknown, type: string): string {
  if (value === null || value === undefined) return type === "number_or_unlimited" ? "No Limit" : "—";
  if (type === "boolean") return value ? "Enabled" : "Disabled";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function HistoryButton({ settingKey, label }: { settingKey: string; label: string }) {
  const [open, setOpen] = useState(false);
  const histFn = useServerFn(getSettingHistory);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["setting-history", settingKey],
    queryFn: () => histFn({ data: { key: settingKey, limit: 20 } }),
    enabled: open,
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) refetch(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost"><History className="h-3.5 w-3.5 mr-1" /> History</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{label} — Change history</DialogTitle>
          <DialogDescription>Last 20 changes for this setting.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && (data?.history ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No history yet.</p>
          )}
          {(data?.history ?? []).map((h: any) => (
            <div key={h.id} className="border rounded p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="font-medium">{h.changed_by_name ?? "Unknown"}</span>
                <span className="text-muted-foreground">{format(new Date(h.changed_at), "PPp")}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-muted-foreground">From</p>
                  <pre className="bg-muted/40 p-2 rounded overflow-x-auto">{JSON.stringify(h.old_value, null, 2)}</pre>
                </div>
                <div>
                  <p className="text-muted-foreground">To</p>
                  <pre className="bg-muted/40 p-2 rounded overflow-x-auto">{JSON.stringify(h.new_value, null, 2)}</pre>
                </div>
              </div>
              {h.change_reason && <p className="text-muted-foreground">Reason: {h.change_reason}</p>}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DangerZone() {
  const forceLogoutFn = useServerFn(forceLogoutAllUsers);
  const exportFn = useServerFn(exportConfiguration);
  const importFn = useServerFn(importConfiguration);
  const restoreFn = useServerFn(restoreDefaults);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const onExport = async () => {
    try {
      const cfg = await exportFn();
      const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `admin-config-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Configuration exported");
    } catch (e: any) { toast.error(e?.message ?? "Export failed"); }
  };

  const onImport = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await importFn({
        data: {
          settings: parsed.settings ?? [],
          feature_flags: parsed.feature_flags ?? [],
        },
      });
      toast.success("Configuration imported");
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    } catch (e: any) { toast.error(e?.message ?? "Import failed"); }
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" /> Danger Zone
        </CardTitle>
        <CardDescription>Destructive and global system actions. Use with extreme caution.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <DangerAction
          title="Force Logout All Users"
          description="Immediately revokes every active session across all users."
          confirmWord="LOGOUT"
          actionLabel="Force Logout All"
          onConfirm={async () => {
            const res = await forceLogoutFn();
            toast.success(`Signed out ${res.count} user${res.count === 1 ? "" : "s"}`);
          }}
        />

        <DangerAction
          title="Export Configuration"
          description="Download all settings and feature flags as a JSON file."
          confirmWord="EXPORT"
          actionLabel="Export Configuration"
          variant="secondary"
          onConfirm={onExport}
        />

        <div className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <p className="font-medium">Import Configuration</p>
            <p className="text-xs text-muted-foreground">Apply a previously exported JSON configuration file.</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImport(f);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              Choose File
            </Button>
          </div>
        </div>

        <DangerAction
          title="Restore Defaults"
          description="Flag a defaults restore request for review."
          confirmWord="RESTORE"
          actionLabel="Restore Defaults"
          onConfirm={async () => {
            const res = await restoreFn();
            toast.message(res.note ?? "Restore requested");
          }}
        />
      </CardContent>
    </Card>
  );
}

function DangerAction({
  title, description, confirmWord, actionLabel, onConfirm, variant = "destructive",
}: {
  title: string;
  description: string;
  confirmWord: string;
  actionLabel: string;
  onConfirm: () => Promise<void> | void;
  variant?: "destructive" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); setText(""); }}>
        <DialogTrigger asChild>
          <Button variant={variant}>{actionLabel}</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Type <code className="font-mono bg-muted px-1 rounded">{confirmWord}</code> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={confirmWord} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant={variant}
              disabled={text !== confirmWord || busy}
              onClick={async () => {
                setBusy(true);
                try { await onConfirm(); setOpen(false); } finally { setBusy(false); }
              }}
            >
              {busy ? "Working…" : actionLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

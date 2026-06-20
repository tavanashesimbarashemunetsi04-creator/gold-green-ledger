import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Save,
  Trash2,
  Pencil,
  KeyRound,
  Users,
  Building2,
  ArrowLeftRight,
  Wallet,
  ShieldCheck,
  Palette,
  Coins,
  Megaphone,

} from "lucide-react";
import {
  saveAppSettings,
  upsertBranch,
  setBranchActive,
  adminDeleteUser,
  setPrimaryRole,
} from "@/lib/admin-settings.functions";
import {
  adminCreateUser,
  adminResetPassword,
  adminSetUserStatus,
} from "@/lib/admin-users.functions";
import {
  getCurrencyRates,
  saveCurrencyRates,
  getRateHistory,
} from "@/lib/currency.functions";

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettingsPage,
});

type Role = "admin" | "finance_manager" | "teller" | "manager";
type ProfileRow = {
  id: string;
  user_id: string;
  full_name: string | null;
  username: string | null;
  email: string | null;
  status: "active" | "suspended" | "locked";
};
type BranchRow = {
  id: string;
  name: string;
  code: string | null;
  location: string | null;
  is_active: boolean;
};

type Settings = {
  transactions: {
    ecocash_enabled: boolean;
    agency_banking_enabled: boolean;
    internal_transfers_enabled: boolean;
    max_transaction_limit: number;
  };
  cash_handling: {
    require_finance_approval_for_float: boolean;
    allow_cash_shortages: boolean;
    allow_cash_excess: boolean;
    require_reason_for_variance: boolean;
  };
  security: {
    session_timeout_minutes: number;
    login_attempt_limit: number;
    two_factor_enabled: boolean;
  };
  personalisation: {
    theme: "light" | "dark";
    dashboard_layout: "compact" | "standard";
    default_landing_page: "dashboard" | "transactions" | "users";
    date_format: "DD/MM/YYYY" | "MM/DD/YYYY";
    currency_display: "USD" | "ZWG";
  };
  announcement: {
    message: string;
    updated_at: string;
  };
};


const DEFAULTS: Settings = {
  transactions: {
    ecocash_enabled: true,
    agency_banking_enabled: true,
    internal_transfers_enabled: true,
    max_transaction_limit: 10000,
  },
  cash_handling: {
    require_finance_approval_for_float: true,
    allow_cash_shortages: false,
    allow_cash_excess: false,
    require_reason_for_variance: true,
  },
  security: {
    session_timeout_minutes: 30,
    login_attempt_limit: 5,
    two_factor_enabled: false,
  },
  personalisation: {
    theme: "light",
    dashboard_layout: "standard",
    default_landing_page: "dashboard",
    date_format: "DD/MM/YYYY",
    currency_display: "USD",
  },
  announcement: {
    message: "",
    updated_at: "",
  },
};


function AdminSettingsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [original, setOriginal] = useState<Settings>(DEFAULTS);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [rolesMap, setRolesMap] = useState<Record<string, Role[]>>({});
  const [branches, setBranches] = useState<BranchRow[]>([]);

  const saveSettingsFn = useServerFn(saveAppSettings);
  const upsertBranchFn = useServerFn(upsertBranch);
  const setBranchActiveFn = useServerFn(setBranchActive);
  const deleteUserFn = useServerFn(adminDeleteUser);
  const setRoleFn = useServerFn(setPrimaryRole);
  const createUserFn = useServerFn(adminCreateUser);
  const resetPasswordFn = useServerFn(adminResetPassword);
  const setStatusFn = useServerFn(adminSetUserStatus);

  const load = async () => {
    setLoading(true);
    const [s, p, r, b] = await Promise.all([
      supabase.from("app_settings").select("value").eq("key", "global").maybeSingle(),
      supabase.from("profiles").select("id,user_id,full_name,username,email,status").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("branches").select("*").order("name"),
    ]);
    if (s.data?.value) {
      const v = s.data.value as Partial<Settings>;
      const merged: Settings = {
        transactions: { ...DEFAULTS.transactions, ...(v.transactions ?? {}) },
        cash_handling: { ...DEFAULTS.cash_handling, ...(v.cash_handling ?? {}) },
        security: { ...DEFAULTS.security, ...(v.security ?? {}) },
        personalisation: { ...DEFAULTS.personalisation, ...(v.personalisation ?? {}) },
        announcement: { ...DEFAULTS.announcement, ...(v.announcement ?? {}) },
      };
      setSettings(merged);
      setOriginal(merged);
    }

    setProfiles((p.data ?? []) as ProfileRow[]);
    const map: Record<string, Role[]> = {};
    for (const row of (r.data ?? []) as { user_id: string; role: Role }[]) {
      (map[row.user_id] ||= []).push(row.role);
    }
    setRolesMap(map);
    setBranches((b.data ?? []) as BranchRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const dirty = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(original),
    [settings, original],
  );

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/" />;

  const onSave = async () => {
    setSaving(true);
    try {
      // bump announcement updated_at if message changed so users get re-notified
      const toSave: Settings = { ...settings };
      if (settings.announcement.message.trim() !== original.announcement.message.trim()) {
        toSave.announcement = {
          message: settings.announcement.message,
          updated_at: new Date().toISOString(),
        };
      }
      await saveSettingsFn({ data: { value: toSave as unknown as Record<string, unknown> } });
      setSettings(toSave);
      setOriginal(toSave);
      toast.success("Settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="p-8 pb-32 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Admin Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure users, branches, transactions, security, and personalisation.
          </p>
        </div>
        {dirty && <Badge variant="outline" className="border-amber-500 text-amber-600">Unsaved changes</Badge>}
      </header>

      <UserControlSection
        profiles={profiles}
        rolesMap={rolesMap}
        onReload={load}
        createUserFn={createUserFn}
        resetPasswordFn={resetPasswordFn}
        setStatusFn={setStatusFn}
        deleteUserFn={deleteUserFn}
        setRoleFn={setRoleFn}
      />

      <BranchSection
        branches={branches}
        onReload={load}
        upsertBranchFn={upsertBranchFn}
        setBranchActiveFn={setBranchActiveFn}
      />

      <AnnouncementSection settings={settings} setSettings={setSettings} />
      <TransactionControls settings={settings} setSettings={setSettings} />
      <CashHandling settings={settings} setSettings={setSettings} />
      <SecuritySection settings={settings} setSettings={setSettings} />
      <PersonalisationSection settings={settings} setSettings={setSettings} />
      <CurrenciesSection />


      <div className="sticky bottom-4 z-30 mx-auto flex max-w-3xl items-center justify-between rounded-xl border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
        <p className="text-sm text-muted-foreground">
          {dirty ? "You have unsaved changes." : "All settings are saved."}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setSettings(original)}
            disabled={!dirty || saving}
          >
            Cancel
          </Button>
          <Button onClick={onSave} disabled={!dirty || saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
      <div>
        <p className="font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

// ============================= 1. User Control =============================
function UserControlSection({
  profiles,
  rolesMap,
  onReload,
  createUserFn,
  resetPasswordFn,
  setStatusFn,
  deleteUserFn,
  setRoleFn,
}: {
  profiles: ProfileRow[];
  rolesMap: Record<string, Role[]>;
  onReload: () => Promise<void>;
  createUserFn: ReturnType<typeof useServerFn<typeof adminCreateUser>>;
  resetPasswordFn: ReturnType<typeof useServerFn<typeof adminResetPassword>>;
  setStatusFn: ReturnType<typeof useServerFn<typeof adminSetUserStatus>>;
  deleteUserFn: ReturnType<typeof useServerFn<typeof adminDeleteUser>>;
  setRoleFn: ReturnType<typeof useServerFn<typeof setPrimaryRole>>;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [resetting, setResetting] = useState<ProfileRow | null>(null);
  const [deleting, setDeleting] = useState<ProfileRow | null>(null);

  const onToggleStatus = async (p: ProfileRow) => {
    try {
      const next = p.status === "active" ? "suspended" : "active";
      await setStatusFn({ data: { user_id: p.user_id, status: next } });
      toast.success(`User ${next}`);
      await onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const onRoleChange = async (p: ProfileRow, role: "admin" | "finance_manager" | "teller") => {
    try {
      await setRoleFn({ data: { user_id: p.user_id, role } });
      toast.success("Role updated");
      await onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <SectionCard
      title="1. User Control"
      description="Manage user accounts, roles, and access."
      icon={Users}
    >
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add User
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => {
              const roles = rolesMap[p.user_id] ?? [];
              const primary: "admin" | "finance_manager" | "teller" =
                roles.includes("admin")
                  ? "admin"
                  : roles.includes("finance_manager")
                    ? "finance_manager"
                    : "teller";
              return (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{p.full_name || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.username || "—"}</td>
                  <td className="px-4 py-3">
                    <Select
                      value={primary}
                      onValueChange={(v) => onRoleChange(p, v as "admin" | "finance_manager" | "teller")}
                    >
                      <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="finance_manager">Finance Manager</SelectItem>
                        <SelectItem value="teller">Teller</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={p.status === "active"}
                        onCheckedChange={() => onToggleStatus(p)}
                      />
                      <span className="text-xs text-muted-foreground capitalize">{p.status}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setResetting(p)}>
                        <KeyRound className="mr-1 h-3 w-3" /> Reset
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => setDeleting(p)}>
                        <Trash2 className="mr-1 h-3 w-3" /> Remove
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {profiles.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AddUserDialog open={addOpen} onOpenChange={setAddOpen} onCreated={onReload} createUserFn={createUserFn} />

      <ResetPasswordDialog
        profile={resetting}
        onClose={() => setResetting(null)}
        resetPasswordFn={resetPasswordFn}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove user?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <strong>{deleting?.email}</strong> and revokes access. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleting) return;
                try {
                  await deleteUserFn({ data: { user_id: deleting.user_id } });
                  toast.success("User removed");
                  setDeleting(null);
                  await onReload();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed");
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}

function AddUserDialog({
  open,
  onOpenChange,
  onCreated,
  createUserFn,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => Promise<void>;
  createUserFn: ReturnType<typeof useServerFn<typeof adminCreateUser>>;
}) {
  const [form, setForm] = useState({
    full_name: "",
    username: "",
    email: "",
    role: "teller" as "admin" | "finance_manager" | "teller",
    password: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      await createUserFn({
        data: {
          full_name: form.full_name,
          username: form.username,
          email: form.email,
          role: form.role,
          password: form.password,
          is_temporary_password: true,
          require_password_change: true,
        },
      });
      toast.success("User created");
      onOpenChange(false);
      setForm({ full_name: "", username: "", email: "", role: "teller", password: "" });
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add User</DialogTitle>
          <DialogDescription>Create a new user account.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Full name</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <Label>Username</Label>
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as typeof form.role })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="finance_manager">Finance Manager</SelectItem>
                <SelectItem value="teller">Teller</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Temporary password</Label>
            <Input
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Min 8 chars, mixed case, number, symbol"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  profile,
  onClose,
  resetPasswordFn,
}: {
  profile: ProfileRow | null;
  onClose: () => void;
  resetPasswordFn: ReturnType<typeof useServerFn<typeof adminResetPassword>>;
}) {
  const [pw, setPw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { setPw(""); }, [profile]);
  const submit = async () => {
    if (!profile) return;
    setSubmitting(true);
    try {
      await resetPasswordFn({ data: { user_id: profile.user_id, new_password: pw, require_change: true } });
      toast.success("Password reset");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Dialog open={!!profile} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
          <DialogDescription>Set a new temporary password for {profile?.email}.</DialogDescription>
        </DialogHeader>
        <div>
          <Label>New password</Label>
          <Input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Min 8 chars, mixed case, number, symbol" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !pw}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================= 2. Branch Management =============================
function BranchSection({
  branches,
  onReload,
  upsertBranchFn,
  setBranchActiveFn,
}: {
  branches: BranchRow[];
  onReload: () => Promise<void>;
  upsertBranchFn: ReturnType<typeof useServerFn<typeof upsertBranch>>;
  setBranchActiveFn: ReturnType<typeof useServerFn<typeof setBranchActive>>;
}) {
  const [editing, setEditing] = useState<BranchRow | null>(null);
  const [open, setOpen] = useState(false);

  const onToggle = async (b: BranchRow) => {
    try {
      await setBranchActiveFn({ data: { id: b.id, is_active: !b.is_active } });
      toast.success(`Branch ${b.is_active ? "deactivated" : "activated"}`);
      await onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <SectionCard
      title="2. Branch Management"
      description="Manage company branches available for assignment."
      icon={Building2}
    >
      <div className="mb-4 flex justify-end">
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Add Branch
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Branch Name</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.id} className="border-t">
                <td className="px-4 py-3 font-medium">{b.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{b.code || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{b.location || "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={b.is_active} onCheckedChange={() => onToggle(b)} />
                    <Badge variant={b.is_active ? "default" : "secondary"}>
                      {b.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="outline" size="sm" onClick={() => { setEditing(b); setOpen(true); }}>
                    <Pencil className="mr-1 h-3 w-3" /> Edit
                  </Button>
                </td>
              </tr>
            ))}
            {branches.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No branches yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <BranchDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onSaved={onReload}
        upsertBranchFn={upsertBranchFn}
      />
    </SectionCard>
  );
}

function BranchDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
  upsertBranchFn,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: BranchRow | null;
  onSaved: () => Promise<void>;
  upsertBranchFn: ReturnType<typeof useServerFn<typeof upsertBranch>>;
}) {
  const [form, setForm] = useState({ name: "", code: "", location: "" });
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    setForm({
      name: editing?.name ?? "",
      code: editing?.code ?? "",
      location: editing?.location ?? "",
    });
  }, [editing, open]);

  const submit = async () => {
    setSubmitting(true);
    try {
      await upsertBranchFn({
        data: {
          id: editing?.id,
          name: form.name,
          code: form.code,
          location: form.location || null,
        },
      });
      toast.success(editing ? "Branch updated" : "Branch added");
      onOpenChange(false);
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Branch" : "Add Branch"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Branch Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Branch Code</Label>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </div>
          <div>
            <Label>Branch Location <span className="text-muted-foreground">(optional)</span></Label>
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !form.name || !form.code}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================= 3. Transaction Controls =============================
function TransactionControls({
  settings,
  setSettings,
}: {
  settings: Settings;
  setSettings: (s: Settings) => void;
}) {
  const t = settings.transactions;
  const update = (patch: Partial<Settings["transactions"]>) =>
    setSettings({ ...settings, transactions: { ...t, ...patch } });

  return (
    <SectionCard
      title="3. Transaction Controls"
      description="Enable or disable transaction channels and set limits."
      icon={ArrowLeftRight}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <ToggleRow
          label="Enable EcoCash Transactions"
          checked={t.ecocash_enabled}
          onCheckedChange={(v) => update({ ecocash_enabled: v })}
        />
        <ToggleRow
          label="Enable Agency Banking"
          checked={t.agency_banking_enabled}
          onCheckedChange={(v) => update({ agency_banking_enabled: v })}
        />
        <ToggleRow
          label="Enable Internal Transfers"
          checked={t.internal_transfers_enabled}
          onCheckedChange={(v) => update({ internal_transfers_enabled: v })}
        />
        <div className="rounded-lg border p-4">
          <Label>Max Transaction Limit</Label>
          <Input
            type="number"
            min={0}
            value={t.max_transaction_limit}
            onChange={(e) => update({ max_transaction_limit: Number(e.target.value) })}
            className="mt-2"
          />
        </div>
      </div>
    </SectionCard>
  );
}

// ============================= 4. Cash Handling =============================
function CashHandling({
  settings,
  setSettings,
}: {
  settings: Settings;
  setSettings: (s: Settings) => void;
}) {
  const c = settings.cash_handling;
  const update = (patch: Partial<Settings["cash_handling"]>) =>
    setSettings({ ...settings, cash_handling: { ...c, ...patch } });

  return (
    <SectionCard
      title="4. Cash Handling"
      description="Control float approval and variance policies."
      icon={Wallet}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <ToggleRow
          label="Require Finance Approval for Float"
          checked={c.require_finance_approval_for_float}
          onCheckedChange={(v) => update({ require_finance_approval_for_float: v })}
        />
        <ToggleRow
          label="Allow Cash Shortages"
          checked={c.allow_cash_shortages}
          onCheckedChange={(v) => update({ allow_cash_shortages: v })}
        />
        <ToggleRow
          label="Allow Cash Excess"
          checked={c.allow_cash_excess}
          onCheckedChange={(v) => update({ allow_cash_excess: v })}
        />
        <ToggleRow
          label="Require Reason for Variance"
          checked={c.require_reason_for_variance}
          onCheckedChange={(v) => update({ require_reason_for_variance: v })}
        />
      </div>
    </SectionCard>
  );
}

// ============================= 5. Security =============================
function SecuritySection({
  settings,
  setSettings,
}: {
  settings: Settings;
  setSettings: (s: Settings) => void;
}) {
  const s = settings.security;
  const update = (patch: Partial<Settings["security"]>) =>
    setSettings({ ...settings, security: { ...s, ...patch } });

  return (
    <SectionCard
      title="5. Security"
      description="Session, login, and authentication policies."
      icon={ShieldCheck}
    >
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border p-4">
          <Label>Session Timeout (minutes)</Label>
          <Input
            type="number"
            min={1}
            value={s.session_timeout_minutes}
            onChange={(e) => update({ session_timeout_minutes: Number(e.target.value) })}
            className="mt-2"
          />
        </div>
        <div className="rounded-lg border p-4">
          <Label>Login Attempt Limit</Label>
          <Input
            type="number"
            min={1}
            value={s.login_attempt_limit}
            onChange={(e) => update({ login_attempt_limit: Number(e.target.value) })}
            className="mt-2"
          />
        </div>
        <ToggleRow
          label="Two-Factor Authentication"
          checked={s.two_factor_enabled}
          onCheckedChange={(v) => update({ two_factor_enabled: v })}
        />
      </div>
    </SectionCard>
  );
}

// ============================= 6. Personalisation =============================
function PersonalisationSection({
  settings,
  setSettings,
}: {
  settings: Settings;
  setSettings: (s: Settings) => void;
}) {
  const p = settings.personalisation;
  const update = (patch: Partial<Settings["personalisation"]>) =>
    setSettings({ ...settings, personalisation: { ...p, ...patch } });

  return (
    <SectionCard
      title="6. Personalisation Settings"
      description="Default UI preferences for the system."
      icon={Palette}
    >
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border p-4">
          <Label>System Theme</Label>
          <Select value={p.theme} onValueChange={(v) => update({ theme: v as "light" | "dark" })}>
            <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-lg border p-4">
          <Label>Dashboard Layout</Label>
          <Select value={p.dashboard_layout} onValueChange={(v) => update({ dashboard_layout: v as "compact" | "standard" })}>
            <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="compact">Compact</SelectItem>
              <SelectItem value="standard">Standard</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-lg border p-4">
          <Label>Default Landing Page</Label>
          <Select value={p.default_landing_page} onValueChange={(v) => update({ default_landing_page: v as "dashboard" | "transactions" | "users" })}>
            <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="dashboard">Dashboard</SelectItem>
              <SelectItem value="transactions">Transactions</SelectItem>
              <SelectItem value="users">Users</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-lg border p-4">
          <Label>Date Format</Label>
          <Select value={p.date_format} onValueChange={(v) => update({ date_format: v as "DD/MM/YYYY" | "MM/DD/YYYY" })}>
            <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
              <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-lg border p-4">
          <Label>Currency Display</Label>
          <Select value={p.currency_display} onValueChange={(v) => update({ currency_display: v as "USD" | "ZWG" })}>
            <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="ZWG">ZWG</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </SectionCard>
  );
}

// ============================= 7. Currencies =============================
function CurrenciesSection() {
  const getRatesFn = useServerFn(getCurrencyRates);
  const saveRatesFn = useServerFn(saveCurrencyRates);
  const getHistoryFn = useServerFn(getRateHistory);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [payments, setPayments] = useState("0");
  const [withdrawals, setWithdrawals] = useState("0");
  const [paymentsUpdated, setPaymentsUpdated] = useState<string | null>(null);
  const [withdrawalsUpdated, setWithdrawalsUpdated] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ id: string; kind: string; old_rate: number | null; new_rate: number; changed_at: string }>>([]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await getRatesFn();
      if (r) {
        setPayments(String(r.payments_rate ?? 0));
        setWithdrawals(String(r.withdrawals_rate ?? 0));
        setPaymentsUpdated(r.payments_updated_at ?? null);
        setWithdrawalsUpdated(r.withdrawals_updated_at ?? null);
      }
      const h = await getHistoryFn();
      setHistory(h as never);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load rates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onSave = async () => {
    const p = Number(payments);
    const w = Number(withdrawals);
    if (!(p >= 0) || !(w >= 0)) return toast.error("Rates must be non-negative numbers");
    setSaving(true);
    try {
      await saveRatesFn({ data: { payments_rate: p, withdrawals_rate: w } });
      toast.success("Rates saved");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save rates");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="7. Currencies"
      description="Manage exchange rates used by all tellers. Changes apply immediately to new transactions."
      icon={Coins}
    >
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border p-4 space-y-2">
              <Label>Payments Rate</Label>
              <Input
                type="number"
                step="0.0001"
                min="0"
                value={payments}
                onChange={(e) => setPayments(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Last updated: {paymentsUpdated ? new Date(paymentsUpdated).toLocaleString() : "—"}
              </p>
            </div>
            <div className="rounded-lg border p-4 space-y-2">
              <Label>Withdrawals Rate</Label>
              <Input
                type="number"
                step="0.0001"
                min="0"
                value={withdrawals}
                onChange={(e) => setWithdrawals(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Last updated: {withdrawalsUpdated ? new Date(withdrawalsUpdated).toLocaleString() : "—"}
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={onSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Rates
            </Button>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-medium">Recent rate changes</h4>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left">Kind</th>
                    <th className="px-3 py-2 text-left">Old</th>
                    <th className="px-3 py-2 text-left">New</th>
                    <th className="px-3 py-2 text-left">When</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-t">
                      <td className="px-3 py-2 capitalize">{h.kind}</td>
                      <td className="px-3 py-2">{h.old_rate ?? "—"}</td>
                      <td className="px-3 py-2">{h.new_rate}</td>
                      <td className="px-3 py-2">{new Date(h.changed_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                        No changes yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function AnnouncementSection({
  settings,
  setSettings,
}: {
  settings: Settings;
  setSettings: (s: Settings) => void;
}) {
  const a = settings.announcement;
  const update = (patch: Partial<Settings["announcement"]>) =>
    setSettings({ ...settings, announcement: { ...a, ...patch } });

  return (
    <SectionCard
      title="0. Staff Announcement"
      description="Post a full-screen notice every user must acknowledge on login or while working."
      icon={Megaphone}
    >
      <div className="space-y-3">
        <Label>Announcement Message</Label>
        <Textarea
          rows={5}
          value={a.message}
          placeholder="e.g. Effective today, the EcoCash commission rate has changed to 2.5%."
          onChange={(e) => update({ message: e.target.value })}
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {a.updated_at
              ? `Last posted: ${new Date(a.updated_at).toLocaleString()}`
              : "No announcement currently active."}
          </span>
          {a.message.trim().length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => update({ message: "", updated_at: "" })}
            >
              Clear announcement
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Saving a new message re-prompts every user, even those who acknowledged a previous notice.
        </p>
      </div>
    </SectionCard>
  );
}

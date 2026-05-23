import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Search,
  ShieldCheck,
  Shield,
  User as UserIcon,
  MoreHorizontal,
  Plus,
  Loader2,
  KeyRound,
  Ban,
  CheckCircle2,
  Lock,
  Eye,
  UserCog,
} from "lucide-react";
import {
  adminCreateUser,
  adminResetPassword,
  adminSetUserStatus,
} from "@/lib/admin-users.functions";
import { grantRole } from "@/lib/float.functions";

export const Route = createFileRoute("/admin/users")({
  component: AdminUsersPage,
});

type Role = "admin" | "manager" | "finance_manager" | "teller";
const ALL_ROLES: Role[] = ["admin", "finance_manager", "manager", "teller"];
const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  finance_manager: "Finance Manager",
  manager: "Manager",
  teller: "Teller",
};
type AccountStatus = "active" | "suspended" | "locked";
type ProfileRow = {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
  username: string | null;
  status: AccountStatus;
  is_temporary_password: boolean;
  require_password_change: boolean;
  last_login_at: string | null;
  created_at: string;
};

function passwordIssues(pw: string): string[] {
  const issues: string[] = [];
  if (pw.length < 8) issues.push("At least 8 characters");
  if (!/[A-Z]/.test(pw)) issues.push("One uppercase letter");
  if (!/[a-z]/.test(pw)) issues.push("One lowercase letter");
  if (!/[0-9]/.test(pw)) issues.push("One number");
  if (!/[^A-Za-z0-9]/.test(pw)) issues.push("One special character");
  return issues;
}

function statusBadge(s: AccountStatus) {
  if (s === "active") return <Badge className="bg-emerald-600 hover:bg-emerald-600">Active</Badge>;
  if (s === "suspended") return <Badge variant="destructive">Suspended</Badge>;
  return <Badge className="bg-amber-600 hover:bg-amber-600">Locked</Badge>;
}

function AdminUsersPage() {
  const { isAdmin, loading: authLoading } = useAuth();

  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [rolesMap, setRolesMap] = useState<Record<string, Role[]>>({});
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  // dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [viewing, setViewing] = useState<ProfileRow | null>(null);
  const [resetting, setResetting] = useState<ProfileRow | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    profile: ProfileRow;
    status: AccountStatus;
    label: string;
  } | null>(null);

  const createUser = useServerFn(adminCreateUser);
  const resetPassword = useServerFn(adminResetPassword);
  const setUserStatus = useServerFn(adminSetUserStatus);

  const load = async () => {
    setLoading(true);
    const [p, r] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (p.error) toast.error(p.error.message);
    if (r.error) toast.error(r.error.message);
    setProfiles((p.data ?? []) as ProfileRow[]);
    const map: Record<string, Role[]> = {};
    for (const row of (r.data ?? []) as { user_id: string; role: Role }[]) {
      (map[row.user_id] ||= []).push(row.role);
    }
    setRolesMap(map);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const filtered = useMemo(() => {
    return profiles.filter((p) => {
      const roles = rolesMap[p.user_id] ?? [];
      if (roleFilter !== "all" && !roles.includes(roleFilter as Role)) return false;
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (p.email ?? "").toLowerCase().includes(q) ||
        (p.full_name ?? "").toLowerCase().includes(q) ||
        (p.username ?? "").toLowerCase().includes(q)
      );
    });
  }, [profiles, rolesMap, search, roleFilter, statusFilter]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/" />;

  const onChangeStatus = async (profile: ProfileRow, status: AccountStatus) => {
    try {
      await setUserStatus({ data: { user_id: profile.user_id, status } });
      toast.success(`User ${status}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">
            Manage user accounts, roles, and access status.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Create New User
        </Button>
      </header>

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, username or email"
              className="pl-9"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="teller">Teller</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="locked">Locked</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{filtered.length} users</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Full Name</th>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last Login</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const roles = rolesMap[p.user_id] ?? [];
                return (
                  <tr key={p.id} className="border-t">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                          <UserIcon className="h-4 w-4" />
                        </div>
                        <p className="font-medium">{p.full_name || p.display_name || "—"}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.username || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {roles.length === 0 && <Badge variant="outline">none</Badge>}
                        {roles.map((r) => (
                          <Badge key={r} variant={r === "admin" ? "default" : "secondary"}>
                            {r === "admin" && <ShieldCheck className="mr-1 h-3 w-3" />}
                            {r === "manager" && <Shield className="mr-1 h-3 w-3" />}
                            {r}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.email}</td>
                    <td className="px-4 py-3">{statusBadge(p.status)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {p.last_login_at ? new Date(p.last_login_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => setViewing(p)}>
                            <Eye className="mr-2 h-4 w-4" /> View user
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setResetting(p)}>
                            <KeyRound className="mr-2 h-4 w-4" /> Reset password
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {p.status !== "active" && (
                            <DropdownMenuItem
                              onClick={() =>
                                setConfirmAction({ profile: p, status: "active", label: "activate" })
                              }
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" /> Activate
                            </DropdownMenuItem>
                          )}
                          {p.status !== "suspended" && (
                            <DropdownMenuItem
                              onClick={() =>
                                setConfirmAction({
                                  profile: p,
                                  status: "suspended",
                                  label: "suspend",
                                })
                              }
                            >
                              <Ban className="mr-2 h-4 w-4" /> Suspend
                            </DropdownMenuItem>
                          )}
                          {p.status !== "locked" && (
                            <DropdownMenuItem
                              onClick={() =>
                                setConfirmAction({ profile: p, status: "locked", label: "lock" })
                              }
                            >
                              <Lock className="mr-2 h-4 w-4" /> Lock
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={load}
        createUser={createUser}
      />

      <ViewUserDialog profile={viewing} roles={viewing ? rolesMap[viewing.user_id] ?? [] : []} onClose={() => setViewing(null)} />

      <ResetPasswordDialog
        profile={resetting}
        onClose={() => setResetting(null)}
        onDone={load}
        resetPassword={resetPassword}
      />

      <AlertDialog
        open={!!confirmAction}
        onOpenChange={(o) => !o && setConfirmAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Confirm {confirmAction?.label}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {confirmAction?.label}{" "}
              <strong>{confirmAction?.profile.email}</strong>?
              {confirmAction?.status !== "active" &&
                " This user will be unable to sign in until reactivated."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmAction) return;
                await onChangeStatus(confirmAction.profile, confirmAction.status);
                setConfirmAction(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  onCreated,
  createUser,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void | Promise<void>;
  createUser: ReturnType<typeof useServerFn<typeof adminCreateUser>>;
}) {
  const [form, setForm] = useState({
    full_name: "",
    username: "",
    email: "",
    role: "teller" as "admin" | "teller" | "finance_manager",
    password: "",
    confirm: "",
    is_temporary_password: false,
    require_password_change: false,
  });
  const [submitting, setSubmitting] = useState(false);

  const issues = passwordIssues(form.password);
  const mismatch = form.confirm.length > 0 && form.confirm !== form.password;
  const canSubmit =
    form.full_name &&
    form.username &&
    form.email &&
    issues.length === 0 &&
    !mismatch;

  const reset = () =>
    setForm({
      full_name: "",
      username: "",
      email: "",
      role: "teller",
      password: "",
      confirm: "",
      is_temporary_password: false,
      require_password_change: false,
    });

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await createUser({
        data: {
          full_name: form.full_name,
          username: form.username,
          email: form.email,
          role: form.role,
          password: form.password,
          is_temporary_password: form.is_temporary_password,
          require_password_change: form.require_password_change,
        },
      });
      toast.success("User created");
      reset();
      onOpenChange(false);
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create new user</DialogTitle>
          <DialogDescription>
            Account will be created and the user can sign in immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Username</Label>
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="jdoe"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v as "admin" | "teller" | "finance_manager" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="teller">Teller</SelectItem>
                  <SelectItem value="finance_manager">Finance Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Password</Label>
              <PasswordInput
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm Password</Label>
              <PasswordInput
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              />
            </div>
          </div>

          {form.password && issues.length > 0 && (
            <ul className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              {issues.map((i) => (
                <li key={i}>• {i}</li>
              ))}
            </ul>
          )}
          {mismatch && (
            <p className="text-xs text-destructive">Passwords do not match.</p>
          )}

          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm">Temporary password</Label>
                <p className="text-xs text-muted-foreground">
                  Mark this password as temporary.
                </p>
              </div>
              <Switch
                checked={form.is_temporary_password}
                onCheckedChange={(v) =>
                  setForm({
                    ...form,
                    is_temporary_password: v,
                    require_password_change: v || form.require_password_change,
                  })
                }
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm">Require password change on first login</Label>
                <p className="text-xs text-muted-foreground">
                  Forces user to set a new password before accessing the app.
                </p>
              </div>
              <Switch
                checked={form.require_password_change}
                onCheckedChange={(v) => setForm({ ...form, require_password_change: v })}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewUserDialog({
  profile,
  roles,
  onClose,
}: {
  profile: ProfileRow | null;
  roles: Role[];
  onClose: () => void;
}) {
  return (
    <Dialog open={!!profile} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>User details</DialogTitle>
        </DialogHeader>
        {profile && (
          <div className="space-y-2 text-sm">
            <Row label="Full Name" value={profile.full_name || "—"} />
            <Row label="Username" value={profile.username || "—"} />
            <Row label="Email" value={profile.email || "—"} />
            <Row label="Roles" value={roles.join(", ") || "none"} />
            <Row label="Status" value={profile.status} />
            <Row
              label="Temporary password"
              value={profile.is_temporary_password ? "Yes" : "No"}
            />
            <Row
              label="Must change password"
              value={profile.require_password_change ? "Yes" : "No"}
            />
            <Row
              label="Last login"
              value={profile.last_login_at ? new Date(profile.last_login_at).toLocaleString() : "—"}
            />
            <Row label="Created" value={new Date(profile.created_at).toLocaleString()} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1.5 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function ResetPasswordDialog({
  profile,
  onClose,
  onDone,
  resetPassword,
}: {
  profile: ProfileRow | null;
  onClose: () => void;
  onDone: () => void | Promise<void>;
  resetPassword: ReturnType<typeof useServerFn<typeof adminResetPassword>>;
}) {
  const [pw, setPw] = useState("");
  const [requireChange, setRequireChange] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const issues = passwordIssues(pw);

  useEffect(() => {
    if (!profile) {
      setPw("");
      setRequireChange(true);
    }
  }, [profile]);

  const submit = async () => {
    if (!profile || issues.length > 0) return;
    setSubmitting(true);
    try {
      await resetPassword({
        data: { user_id: profile.user_id, new_password: pw, require_change: requireChange },
      });
      toast.success("Password reset");
      onClose();
      await onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reset password");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!profile} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for <strong>{profile?.email}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>New password</Label>
            <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          {pw && issues.length > 0 && (
            <ul className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              {issues.map((i) => (
                <li key={i}>• {i}</li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label className="text-sm">Require change on next login</Label>
            <Switch checked={requireChange} onCheckedChange={setRequireChange} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={issues.length > 0 || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reset password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

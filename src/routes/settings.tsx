import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Settings as SettingsIcon,
  KeyRound,
  ShieldCheck,
  Loader2,
  Monitor,
  Bell,
  Info,
  UserCircle2,
} from "lucide-react";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

const PasswordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .regex(/[A-Z]/, "Must include uppercase letter")
  .regex(/[a-z]/, "Must include lowercase letter")
  .regex(/[0-9]/, "Must include number")
  .regex(/[^A-Za-z0-9]/, "Must include special character");

type Theme = "light" | "dark" | "system";
type Landing = "/" | "/payments" | "/ecocash";

type TellerPrefs = {
  theme: Theme;
  landing: Landing;
  notifyPendingApproval: boolean;
  showPendingBadge: boolean;
};

const PREFS_KEY = "teller_prefs";
const DEFAULT_PREFS: TellerPrefs = {
  theme: "system",
  landing: "/",
  notifyPendingApproval: true,
  showPendingBadge: true,
};

function loadPrefs(): TellerPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", isDark);
}

function SettingsPage() {
  const { user, roles, loading: authLoading } = useAuth();

  // Profile / session info
  const [fullName, setFullName] = useState("—");
  const [username, setUsername] = useState("—");
  const [email, setEmail] = useState("—");
  const [branchName, setBranchName] = useState("—");
  const [lastLogin, setLastLogin] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Password
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  // Prefs
  const [prefs, setPrefs] = useState<TellerPrefs>(DEFAULT_PREFS);

  const primaryRole = useMemo(
    () =>
      roles.includes("admin")
        ? "admin"
        : roles.includes("manager")
          ? "manager"
          : (roles[0] ?? "teller"),
    [roles],
  );

  // Load prefs once
  useEffect(() => {
    const p = loadPrefs();
    setPrefs(p);
    applyTheme(p.theme);
  }, []);

  // Load profile, branch (via teller_sessions), last login
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoadingProfile(true);
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name,display_name,email,teller_id,last_login_at,branch_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;

      setFullName(prof?.full_name || prof?.display_name || "—");
      setEmail(prof?.email ?? user.email ?? "—");
      setLastLogin(prof?.last_login_at ?? null);

      if (prof?.teller_id) {
        const { data: t } = await supabase
          .from("tellers")
          .select("username")
          .eq("id", prof.teller_id)
          .maybeSingle();
        if (!cancelled) setUsername(t?.username ?? "—");
      }

      // Most recent open teller session -> branch
      const { data: sess } = await supabase
        .from("teller_sessions")
        .select("branch_id,opened_at")
        .eq("user_id", user.id)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const branchId = sess?.branch_id ?? prof?.branch_id ?? null;
      if (branchId) {
        const { data: br } = await supabase
          .from("branches")
          .select("name")
          .eq("id", branchId)
          .maybeSingle();
        if (!cancelled) setBranchName(br?.name ?? "—");
      }
      if (!cancelled) setLoadingProfile(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const updatePrefs = (patch: Partial<TellerPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      if (patch.theme) applyTheme(patch.theme);
      return next;
    });
  };

  const changePassword = async () => {
    if (!user?.email) return;
    if (!currentPwd) return toast.error("Enter current password");
    const parsed = PasswordSchema.safeParse(newPwd);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (newPwd !== confirmPwd) return toast.error("Passwords do not match");
    if (newPwd === currentPwd)
      return toast.error("New password must differ from current");

    setSavingPwd(true);
    const { error: verErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPwd,
    });
    if (verErr) {
      setSavingPwd(false);
      return toast.error("Current password is incorrect");
    }
    const { error: updErr } = await supabase.auth.updateUser({
      password: newPwd,
    });
    if (updErr) {
      setSavingPwd(false);
      return toast.error(updErr.message);
    }
    await supabase.from("security_alerts").insert({
      user_id: user.id,
      alert_type: "password_changed",
      message: "Your password was changed successfully.",
    });
    await supabase.auth.refreshSession();
    setCurrentPwd("");
    setNewPwd("");
    setConfirmPwd("");
    setSavingPwd(false);
    toast.success("Password updated");
  };

  if (authLoading || loadingProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <header className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-soft)]">
          <SettingsIcon className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your security, display, notifications, and session info.
          </p>
        </div>
      </header>

      {/* 1. Password & Security */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">
            Password &amp; Security
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="cur">Current Password</Label>
            <PasswordInput
              id="cur"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new">New Password</Label>
            <PasswordInput
              id="new"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="conf">Confirm New Password</Label>
            <PasswordInput
              id="conf"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              autoComplete="new-password"
            />
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Minimum 8 characters, including uppercase, lowercase, number, and
          special character.
        </p>
        <div className="mt-4 flex justify-end">
          <Button onClick={changePassword} disabled={savingPwd}>
            {savingPwd ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="mr-2 h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      </section>

      {/* 2. Display Preferences */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
        <div className="mb-4 flex items-center gap-2">
          <Monitor className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">
            Display Preferences
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Theme</Label>
            <Select
              value={prefs.theme}
              onValueChange={(v) => updatePrefs({ theme: v as Theme })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Default landing page</Label>
            <Select
              value={prefs.landing}
              onValueChange={(v) => updatePrefs({ landing: v as Landing })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="/">Dashboard</SelectItem>
                <SelectItem value="/payments">Payments</SelectItem>
                <SelectItem value="/ecocash">Ecocash</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* 3. Notification Preferences */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
        <div className="mb-4 flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">
            Notification Preferences
          </h2>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-border bg-background px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                Alert me when a teller transfer is awaiting my approval
              </p>
              <p className="text-xs text-muted-foreground">
                Receive an in-app notification on new pending approvals.
              </p>
            </div>
            <Switch
              checked={prefs.notifyPendingApproval}
              onCheckedChange={(v) =>
                updatePrefs({ notifyPendingApproval: v })
              }
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border bg-background px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                Show a badge on the Pending nav item
              </p>
              <p className="text-xs text-muted-foreground">
                Display a count badge next to "Pending" in the sidebar.
              </p>
            </div>
            <Switch
              checked={prefs.showPendingBadge}
              onCheckedChange={(v) => updatePrefs({ showPendingBadge: v })}
            />
          </div>
        </div>
      </section>

      {/* 4. Session Info */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCircle2 className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              Session Info
            </h2>
          </div>
          <Badge className="bg-[var(--gradient-gold)] text-gold-foreground capitalize">
            {primaryRole}
          </Badge>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          <InfoRow label="Full Name" value={fullName} />
          <InfoRow label="Username" value={username} />
          <InfoRow label="Email" value={email} />
          <InfoRow label="Role" value={primaryRole} />
          <InfoRow label="Branch" value={branchName} />
          <InfoRow
            label="Last Login"
            value={lastLogin ? new Date(lastLogin).toLocaleString() : "—"}
          />
        </dl>
      </section>

      {/* 5. About */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
        <div className="mb-4 flex items-center gap-2">
          <Info className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">About</h2>
        </div>
        <div className="space-y-2 text-sm">
          <p className="text-foreground">
            <span className="font-medium">App:</span> Authentic Financial
            Services — Teller Portal
          </p>
          <p className="text-foreground">
            <span className="font-medium">Version:</span> v1.0
          </p>
          <p className="text-muted-foreground">
            For support, contact your branch administrator.
          </p>
        </div>
      </section>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
        {value}
      </dd>
    </div>
  );
}

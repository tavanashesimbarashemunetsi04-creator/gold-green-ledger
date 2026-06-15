import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  UserCircle2,
  ShieldCheck,
  KeyRound,
  Mail,
  Phone,
  Loader2,
  Bell,
  MonitorSmartphone,
  TrendingUp,
  ArrowDownToLine,
  ArrowUpFromLine,
  Repeat2,
  DollarSign,
  CalendarRange,
  ListChecks,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  getTellerPerformance,
  type TellerPerformance,
} from "@/lib/teller-stats.functions";

export const Route = createFileRoute("/account")({
  component: AccountPage,
});

type Profile = {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  full_name: string | null;
  phone: string | null;
  branch_id: string | null;
  teller_id: string | null;
};

type SecurityAlert = {
  id: string;
  alert_type: string;
  message: string;
  created_at: string;
  is_read: boolean;
};

const phoneSchema = z.string().trim().regex(/^\+?[0-9\s\-()]{7,20}$/, "Invalid phone number");
const emailSchema = z.string().trim().email("Invalid email").max(255);
const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .regex(/[A-Z]/, "Must include uppercase letter")
  .regex(/[a-z]/, "Must include lowercase letter")
  .regex(/[0-9]/, "Must include number")
  .regex(/[^A-Za-z0-9]/, "Must include special character");

function getDeviceId(): string {
  const KEY = "afs.device.id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  const browser = /Edg/.test(ua)
    ? "Edge"
    : /Chrome/.test(ua)
      ? "Chrome"
      : /Firefox/.test(ua)
        ? "Firefox"
        : /Safari/.test(ua)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Device";
  return `${browser} on ${os}`;
}

function AccountPage() {
  const { user, roles, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [branchName, setBranchName] = useState<string>("—");
  const [tellerUsername, setTellerUsername] = useState<string>("—");
  const [loading, setLoading] = useState(true);

  // Edit modes
  const [editPhone, setEditPhone] = useState(false);
  const [editEmail, setEditEmail] = useState(false);
  const [phoneVal, setPhoneVal] = useState("");
  const [emailVal, setEmailVal] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  // Password
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  // Security alerts
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  // Performance summary
  const fetchPerformance = useServerFn(getTellerPerformance);
  const [perf, setPerf] = useState<TellerPerformance | null>(null);
  const [perfLoading, setPerfLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      try {
        const p = await fetchPerformance();
        if (!cancelled) {
          setPerf(p);
          setPerfLoading(false);
        }
      } catch {
        if (!cancelled) setPerfLoading(false);
      }
    };
    load();
    const ch = supabase
      .channel(`teller_perf_${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments" },
        load,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cash_swipes" },
        load,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cash_advance" },
        load,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "internal_transactions" },
        load,
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [user, fetchPerformance]);

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(n || 0);


  const primaryRole = useMemo(
    () => (roles.includes("admin") ? "admin" : roles.includes("manager") ? "manager" : roles[0] ?? "teller"),
    [roles],
  );

  // Load profile + related
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: prof } = await supabase
        .from("profiles")
        .select("id,user_id,email,display_name,full_name,phone,branch_id,teller_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setProfile(prof as Profile | null);
      setPhoneVal(prof?.phone ?? "");
      setEmailVal(prof?.email ?? user.email ?? "");

      if (prof?.branch_id) {
        const { data: br } = await supabase.from("branches").select("name").eq("id", prof.branch_id).maybeSingle();
        if (!cancelled) setBranchName(br?.name ?? "—");
      }
      if (prof?.teller_id) {
        const { data: t } = await supabase.from("tellers").select("username").eq("id", prof.teller_id).maybeSingle();
        if (!cancelled) setTellerUsername(t?.username ?? "—");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Load alerts + realtime
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("security_alerts")
        .select("id,alert_type,message,created_at,is_read")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      setAlerts((data ?? []) as SecurityAlert[]);
    };
    load();
    const ch = supabase
      .channel(`security_alerts_${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "security_alerts", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const a = payload.new as SecurityAlert;
          setAlerts((prev) => [a, ...prev]);
          toast.warning(a.message);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user]);

  // Device / unusual-time detection on login
  useEffect(() => {
    if (!user) return;
    (async () => {
      const deviceId = getDeviceId();
      const label = deviceLabel();
      const ua = navigator.userAgent;
      const { data: existing } = await supabase
        .from("login_sessions")
        .select("id")
        .eq("user_id", user.id)
        .eq("device_id", deviceId)
        .maybeSingle();

      if (!existing) {
        await supabase.from("login_sessions").insert({
          user_id: user.id,
          device_id: deviceId,
          device_label: label,
          user_agent: ua,
        });
        await supabase.from("security_alerts").insert({
          user_id: user.id,
          alert_type: "new_device",
          message: `New device login detected: ${label}`,
          metadata: { user_agent: ua, device_id: deviceId },
        });
      } else {
        await supabase
          .from("login_sessions")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", existing.id);
      }

      // Unusual hours: outside 06:00-20:00 local
      const hr = new Date().getHours();
      const FLAG_KEY = `afs.unusual.${new Date().toDateString()}`;
      if ((hr < 6 || hr >= 20) && !sessionStorage.getItem(FLAG_KEY)) {
        sessionStorage.setItem(FLAG_KEY, "1");
        await supabase.from("security_alerts").insert({
          user_id: user.id,
          alert_type: "unusual_time",
          message: `Login at unusual hour (${hr.toString().padStart(2, "0")}:00).`,
          metadata: { hour: hr },
        });
      }
    })();
  }, [user]);

  const savePhone = async () => {
    if (!user || !profile) return;
    const parsed = phoneSchema.safeParse(phoneVal);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setSavingPhone(true);
    const { error } = await supabase.from("profiles").update({ phone: parsed.data }).eq("user_id", user.id);
    setSavingPhone(false);
    if (error) return toast.error(error.message);
    setProfile({ ...profile, phone: parsed.data });
    setEditPhone(false);
    toast.success("Phone number updated");
  };

  const saveEmail = async () => {
    if (!user || !profile) return;
    const parsed = emailSchema.safeParse(emailVal);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setSavingEmail(true);
    const { error: authErr } = await supabase.auth.updateUser({ email: parsed.data });
    if (authErr) {
      setSavingEmail(false);
      return toast.error(authErr.message);
    }
    const { error } = await supabase.from("profiles").update({ email: parsed.data }).eq("user_id", user.id);
    setSavingEmail(false);
    if (error) return toast.error(error.message);
    setProfile({ ...profile, email: parsed.data });
    setEditEmail(false);
    toast.success("Email updated. Check your inbox to confirm.");
  };

  const changePassword = async () => {
    if (!user?.email) return;
    if (!currentPwd) return toast.error("Enter current password");
    const parsed = passwordSchema.safeParse(newPwd);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (newPwd !== confirmPwd) return toast.error("Passwords do not match");
    if (newPwd === currentPwd) return toast.error("New password must differ from current");

    setSavingPwd(true);
    // Verify current password by reauthenticating
    const { error: verErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPwd,
    });
    if (verErr) {
      setSavingPwd(false);
      return toast.error("Current password is incorrect");
    }
    const { error: updErr } = await supabase.auth.updateUser({ password: newPwd });
    if (updErr) {
      setSavingPwd(false);
      return toast.error(updErr.message);
    }
    // Log activity
    await supabase.from("security_alerts").insert({
      user_id: user.id,
      alert_type: "password_changed",
      message: "Your password was changed successfully.",
    });
    // Refresh session
    await supabase.auth.refreshSession();
    setCurrentPwd("");
    setNewPwd("");
    setConfirmPwd("");
    setSavingPwd(false);
    toast.success("Password updated");
  };

  if (authLoading || loading) {
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
          <UserCircle2 className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">My Account</h1>
          <p className="text-sm text-muted-foreground">Manage your profile, security, and login activity.</p>
        </div>
      </header>

      {/* Profile Card */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Profile Information</h2>
          <Badge className="bg-[var(--gradient-gold)] text-gold-foreground capitalize">{primaryRole}</Badge>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full Name" value={profile?.full_name || profile?.display_name || "—"} />
          <Field label="Username" value={tellerUsername} hint="Read-only" />
          <Field label="Role" value={primaryRole} hint="Read-only" />
          <Field label="Branch" value={branchName} hint="Read-only" />

          {/* Email */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Email Address</Label>
            {editEmail ? (
              <div className="flex gap-2">
                <Input type="email" value={emailVal} onChange={(e) => setEmailVal(e.target.value)} />
                <Button size="sm" onClick={saveEmail} disabled={savingEmail}>
                  {savingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditEmail(false); setEmailVal(profile?.email ?? user?.email ?? ""); }}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                <span className="text-sm text-foreground">{profile?.email ?? user?.email ?? "—"}</span>
                <Button size="sm" variant="outline" onClick={() => setEditEmail(true)}>
                  <Mail className="mr-1 h-3.5 w-3.5" /> Edit
                </Button>
              </div>
            )}
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Phone Number</Label>
            {editPhone ? (
              <div className="flex gap-2">
                <Input type="tel" value={phoneVal} onChange={(e) => setPhoneVal(e.target.value)} placeholder="+263 ..." />
                <Button size="sm" onClick={savePhone} disabled={savingPhone}>
                  {savingPhone ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditPhone(false); setPhoneVal(profile?.phone ?? ""); }}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                <span className="text-sm text-foreground">{profile?.phone || "—"}</span>
                <Button size="sm" variant="outline" onClick={() => setEditPhone(true)}>
                  <Phone className="mr-1 h-3.5 w-3.5" /> Edit
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Password */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Change Password</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="cur">Current Password</Label>
            <PasswordInput id="cur" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new">New Password</Label>
            <PasswordInput id="new" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="conf">Confirm New Password</Label>
            <PasswordInput id="conf" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} autoComplete="new-password" />
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Minimum 8 characters, including uppercase, lowercase, number, and special character.
        </p>
        <div className="mt-4 flex justify-end">
          <Button onClick={changePassword} disabled={savingPwd}>
            {savingPwd ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
            Update Password
          </Button>
        </div>
      </section>

      {/* Security Alerts */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
        <div className="mb-4 flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Security Alerts</h2>
        </div>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No security alerts.</p>
        ) : (
          <ul className="divide-y divide-border">
            {alerts.map((a) => (
              <li key={a.id} className="flex items-start gap-3 py-3">
                <MonitorSmartphone className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm text-foreground">{a.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()} · {a.alert_type.replace(/_/g, " ")}
                  </p>
                </div>
                {!a.is_read && <Badge variant="secondary">New</Badge>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
        <span className="text-sm text-foreground">{value}</span>
        {hint && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}

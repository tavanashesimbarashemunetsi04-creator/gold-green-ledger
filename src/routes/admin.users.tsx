import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Search, Shield, ShieldCheck, User as UserIcon } from "lucide-react";

export const Route = createFileRoute("/admin/users")({
  component: AdminUsersPage,
});

type Role = "admin" | "manager" | "teller";
type ProfileRow = {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
  phone: string | null;
  branch_id: string | null;
  teller_id: string | null;
  created_at: string;
};
type Branch = { id: string; name: string; code: string | null };
type Teller = { id: string; username: string };

function AdminUsersPage() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [rolesMap, setRolesMap] = useState<Record<string, Role[]>>({});
  const [branches, setBranches] = useState<Branch[]>([]);
  const [tellers, setTellers] = useState<Teller[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [p, r, b, t] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("branches").select("id,name,code").order("name"),
      supabase.from("tellers").select("id,username").order("username"),
    ]);
    if (p.error) toast.error(p.error.message);
    if (r.error) toast.error(r.error.message);
    setProfiles((p.data ?? []) as ProfileRow[]);
    const map: Record<string, Role[]> = {};
    for (const row of (r.data ?? []) as { user_id: string; role: Role }[]) {
      (map[row.user_id] ||= []).push(row.role);
    }
    setRolesMap(map);
    setBranches((b.data ?? []) as Branch[]);
    setTellers((t.data ?? []) as Teller[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return profiles.filter((p) => {
      const roles = rolesMap[p.user_id] ?? [];
      if (roleFilter !== "all" && !roles.includes(roleFilter as Role)) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (p.email ?? "").toLowerCase().includes(q) ||
        (p.full_name ?? "").toLowerCase().includes(q) ||
        (p.display_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [profiles, rolesMap, search, roleFilter]);

  const toggleRole = async (userId: string, role: Role) => {
    const current = rolesMap[userId] ?? [];
    const has = current.includes(role);
    if (has) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
      if (error) return toast.error(error.message);
      toast.success(`Removed ${role}`);
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) return toast.error(error.message);
      toast.success(`Granted ${role}`);
    }
    await load();
  };

  const updateProfile = async (userId: string, patch: Partial<ProfileRow>) => {
    const { error } = await supabase.from("profiles").update(patch).eq("user_id", userId);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    await load();
  };

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Users & Roles</h1>
        <p className="text-sm text-muted-foreground">
          Manage role assignments and link users to branches and teller records.
        </p>
      </header>

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by email or name"
              className="pl-9"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="teller">Teller</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={load} disabled={loading}>Refresh</Button>
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
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Roles</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Teller</th>
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
                        <div>
                          <p className="font-medium">{p.full_name || p.display_name || "—"}</p>
                          <p className="text-xs text-muted-foreground">{p.email}</p>
                        </div>
                      </div>
                    </td>
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
                    <td className="px-4 py-3">
                      <Select
                        value={p.branch_id ?? "none"}
                        onValueChange={(v) => updateProfile(p.user_id, { branch_id: v === "none" ? null : v })}
                      >
                        <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Unassigned</SelectItem>
                          {branches.map((b) => (
                            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={p.teller_id ?? "none"}
                        onValueChange={(v) => updateProfile(p.user_id, { teller_id: v === "none" ? null : v })}
                      >
                        <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Unassigned</SelectItem>
                          {tellers.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.username}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {(["admin", "manager", "teller"] as Role[]).map((r) => {
                          const active = roles.includes(r);
                          return (
                            <Button
                              key={r}
                              size="sm"
                              variant={active ? "default" : "outline"}
                              onClick={() => toggleRole(p.user_id, r)}
                            >
                              {active ? `−${r}` : `+${r}`}
                            </Button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && !loading && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">No users found.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        Tip: New users sign up at <code>/login</code>. They appear here automatically and default to the <strong>teller</strong> role.
      </p>
    </div>
  );
}

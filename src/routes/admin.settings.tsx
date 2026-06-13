import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Settings as SettingsIcon, Shield, Bell, Database } from "lucide-react";

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettings,
});

function AdminSettings() {
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <SettingsIcon className="h-7 w-7" />
          Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage system-wide configuration for the admin portal.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4" /> Security
            </CardTitle>
            <CardDescription>Password policy, session timeouts, MFA.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Configuration coming soon.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4" /> Notifications
            </CardTitle>
            <CardDescription>Email and in-app alert preferences.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Configuration coming soon.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4" /> Data & Backups
            </CardTitle>
            <CardDescription>Retention, exports, and backup schedules.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Configuration coming soon.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { Link } from "@tanstack/react-router";
import { Lock, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NoOpenDayNotice({ moduleName }: { moduleName: string }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8">
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-8 text-center shadow-sm dark:bg-amber-950/30">
        <Lock className="mx-auto h-10 w-10 text-amber-600" />
        <h1 className="mt-4 text-2xl font-semibold">{moduleName} is locked</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have an open operational day. Open your day from the
          dashboard to start transacting.
        </p>
        <Button asChild className="mt-6">
          <Link to="/">
            <CalendarClock className="mr-2 h-4 w-4" />
            Go to Dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}

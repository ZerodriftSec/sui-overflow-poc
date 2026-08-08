import { AlertTriangle, Clock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Badge } from "../ui/badge";

interface SchedulerControlsProps {
  isPaused: boolean;
  initialSharedVersion: number;
  lastProcessedAtMs?: number;
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function formatRelativeTimestamp(ms?: number): string {
  if (!ms || ms <= 0) return "Never";
  const diffSeconds = Math.round((ms - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);
  if (abs < 60) return rtf.format(diffSeconds, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSeconds / 3600), "hour");
  return rtf.format(Math.round(diffSeconds / 86400), "day");
}

export function SchedulerControls({ isPaused, lastProcessedAtMs }: SchedulerControlsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Scheduler</CardTitle>
        <CardDescription>
          Controls global payment processing across all platforms
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`h-3 w-3 rounded-full ${isPaused ? "bg-amber-500" : "bg-green-500"}`}
            />
            <span className="font-medium">
              Status: {isPaused ? "Paused" : "Active"}
            </span>
          </div>
          <Badge variant={isPaused ? "secondary" : "default"}>
            {isPaused ? "Paused" : "Active"}
          </Badge>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>Last processed: {formatRelativeTimestamp(lastProcessedAtMs)}</span>
        </div>

        {isPaused && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
            <div className="flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              <p className="text-sm font-medium">Payments are currently paused</p>
            </div>
          </div>
        )}

        <div className="rounded-lg bg-muted p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600" />
            <p className="text-sm text-muted-foreground">
              Scheduler pause/resume was removed in v3. The scheduler runs continuously.
              To pause payments for a specific platform, cancel the subscription.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

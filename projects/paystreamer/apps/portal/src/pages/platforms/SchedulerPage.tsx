import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import {  queryPaymentScheduler  } from "@paystreamer/sdk/core";
import { SchedulerControls } from "../../components/platform/SchedulerControls";
import {  PAYMENT_SCHEDULER_ID  } from "@paystreamer/sdk";

export function SchedulerPage() {
  const { data: scheduler, isPending: schedulerPending } = useQuery({
    queryKey: ["scheduler", PAYMENT_SCHEDULER_ID],
    queryFn: () => queryPaymentScheduler(PAYMENT_SCHEDULER_ID),
  });

  if (schedulerPending) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!scheduler) {
    return (
      <div className="text-center py-12 text-red-500">
        Failed to load scheduler.
      </div>
    );
  }

  const lastProcessedAtMs = scheduler.last_processed_at
    ? Number(scheduler.last_processed_at)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Scheduler Controls</h1>
        <p className="text-muted-foreground text-sm">
          Global payment scheduler management
        </p>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-start gap-2 text-blue-900">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="text-sm">
            The payment scheduler is a shared resource on Sui. Anyone can submit a due payment — there's no central operator. Connect a wallet to test "Process Now" on a subscription you own.
          </p>
        </div>
      </div>

      <SchedulerControls
        isPaused={scheduler.is_paused}
        initialSharedVersion={scheduler.initialSharedVersion}
        lastProcessedAtMs={lastProcessedAtMs}
      />
    </div>
  );
}
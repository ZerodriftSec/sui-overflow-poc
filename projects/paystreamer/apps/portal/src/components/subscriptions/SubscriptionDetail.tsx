import { useQuery } from "@tanstack/react-query";
import { useCurrentClient } from "@mysten/dapp-kit-react";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { Button } from "@paystreamer/sdk";
import { Badge } from "@paystreamer/sdk";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@paystreamer/sdk";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { useState } from "react";
import { formatMistToPUSD } from "../../lib/format";
import { useAppConfig } from "../../hooks/useAppConfig";

interface SubscriptionDetailProps {
  accountId: string;
  capId: string;
  platformId: string;
  subscription: {
    tier_index: number;
    tier_name: string;
    amount: string | number;
    frequency_ms: string | number;
    status: { variant: number };
    next_billing_ts?: string | number;
    total_paid?: string | number;
    payment_count?: number;
  };
  denomination: string;
}

function getFrequencyLabel(ms: string | number): string {
  const raw = typeof ms === "string" ? parseInt(ms) : ms;
  const safeRaw = Number.isNaN(raw) || !raw ? 0 : raw;
  if (safeRaw === 0) return "Unknown";
  if (safeRaw === 86400000) return "Daily";
  if (safeRaw === 604800000) return "Weekly";
  if (safeRaw === 2592000000) return "Monthly";
  if (safeRaw === 31536000000) return "Yearly";
  if (safeRaw < 3600000) return `${Math.round(safeRaw / 60000)} mins`;
  if (safeRaw < 86400000) return `${Math.round(safeRaw / 3600000)} hours`;
  return `${Math.round(safeRaw / 86400000)} days`;
}

export function SubscriptionDetail({
  accountId,
  platformId,
  subscription,
  denomination: _denomination,
}: SubscriptionDetailProps) {
    const config = useAppConfig();
  const client = useCurrentClient();
  const account = useCurrentAccount();
  const [expanded, setExpanded] = useState(true);

  const { data: platform } = useQuery({
    queryKey: ["platform", platformId, config.network],
    queryFn: async () => {
      const { object } = await client.core.getObject({
        objectId: platformId,
        include: { json: true },
      });
      return object;
    },
    enabled: !!platformId,
  });

  const { data: paymentEvents } = useQuery({
    queryKey: ["payment-events", accountId, platformId, config.network],
    queryFn: async () => {
      if (!account?.address) return [];
      const { queryPaymentProcessedEvents } = await import("@paystreamer/sdk/core");
      const events = await queryPaymentProcessedEvents(accountId, platformId, config.network);
      return events;
    },
    enabled: !!account,
  });

  const platformFields = platform?.json as Record<string, unknown> | undefined;
  const platformName = String(platformFields?.name ?? "Unknown Platform");
  const platformDescription = String(platformFields?.description ?? "No description");

  const statusRaw = subscription?.status as any;
  const statusVariant = typeof statusRaw === 'number' 
    ? statusRaw 
    : (statusRaw?.variant ?? 0);

  const statusType =
    statusVariant === 0
      ? "default"
      : statusVariant === 1
      ? "secondary"
      : "destructive";

  const statusLabel =
    statusVariant === 0
      ? "Active"
      : statusVariant === 1
      ? "Paused"
      : "Cancelled";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle>{platformName}</CardTitle>
              <Badge variant={statusType}>{statusLabel}</Badge>
            </div>
            <CardDescription>{platformDescription}</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Tier</p>
              <p className="font-medium">{subscription.tier_name}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Amount</p>
              <p className="font-medium">
                {formatMistToPUSD((subscription as any).amount || (subscription as any).tier_amount)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Frequency</p>
              <p className="font-medium">
                {getFrequencyLabel((subscription as any).frequency_ms || (subscription as any).tier_frequency_ms || (subscription as any).schedule_frequency_ms)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Next Billing</p>
              <p className="font-medium">
                {((subscription as any).next_billing_ts || (subscription as any).next_billing_time)
                  ? new Date(Number((subscription as any).next_billing_ts || (subscription as any).next_billing_time)).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  : "N/A"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total Paid</p>
              <p className="font-medium">
                {subscription.total_paid
                  ? formatMistToPUSD(subscription.total_paid)
                  : "$0.00 PUSD"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Payment Count</p>
              <p className="font-medium">{subscription.payment_count || 0}</p>
            </div>
          </div>

          <div className="pt-4 border-t">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium">Payment History</p>
              <a
                href={`https://suiscan.xyz/${config.network}/account/${accountId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                View on Explorer
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            {paymentEvents && paymentEvents.length > 0 ? (
              <div className="space-y-2">
                {[...paymentEvents].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10).map((event: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm p-2 rounded bg-muted/50">
                    <div>
                      <p className="font-medium">
                        {formatMistToPUSD(event.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(Number(event.timestamp)).toLocaleString()}
                      </p>
                    </div>
                    <Badge variant="default">Paid</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No payment history yet</p>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

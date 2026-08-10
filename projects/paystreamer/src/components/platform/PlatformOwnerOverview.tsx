import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Users, DollarSign, UserMinus, CheckCircle, UserPlus } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Badge } from "../ui/badge";
import { PlatformObject } from "../../lib/platformDiscovery";
import {
  queryPaymentProcessedEvents,
  querySubscriptionCreatedEventsByPlatform,
  querySubscriptionUpdatedEventsByPlatform,
} from "@paystreamer/sdk/core";
import { useAppConfig } from "../../hooks/useAppConfig";

interface PlatformOwnerOverviewProps {
  platform: PlatformObject;
}

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
}

function MetricCard({ title, value, subtitle, icon }: MetricCardProps) {
      return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="p-2 rounded-lg bg-muted">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function calculateMRR(tiers: PlatformObject["json"]["tiers"]): string {
  if (!tiers || !Array.isArray(tiers) || tiers.length === 0) return "$0.00";

  const activeTiers = tiers.filter((t) => t.is_active);
  const totalMonthly = activeTiers.reduce((sum, tier) => {
    const amount = Number(tier.amount) / 1_000_000_000;
    const subscribers = tier.subscriber_count || 0;
    return sum + amount * subscribers;
  }, 0);

  return `$${totalMonthly.toFixed(2)}`;
}

function formatTimeAgo(ms: number): string {
  const diffMs = Date.now() - ms;
  if (diffMs < 0) return "just now";
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function buildLastSixMonthBuckets(now: Date): { key: string; label: string; start: number; end: number }[] {
  const buckets: { key: string; label: string; start: number; end: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = d.getTime();
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1).getTime();
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: MONTH_LABELS[d.getMonth()],
      start,
      end,
    });
  }
  return buckets;
}

type RecentActivityItem = {
  kind: "payment" | "subscription";
  description: string;
  amountSui: number;
  timestamp: number;
};

export function PlatformOwnerOverview({ platform }: PlatformOwnerOverviewProps) {
    const config = useAppConfig();
  const fields = platform.json;
  const platformId = platform.objectId;

  const { data: monthlyPaymentEvents } = useQuery({
    queryKey: ["payment-events-this-month", platformId, config.network],
    queryFn: async () => {
      const events = await queryPaymentProcessedEvents(undefined, platformId, config.network);
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      return events.filter((e) => Number(e.timestamp) >= startOfMonth);
    },
    enabled: !!platformId,
  });

  const { data: allPaymentEvents } = useQuery({
    queryKey: ["payment-events-all", platformId, config.network],
    queryFn: () => queryPaymentProcessedEvents(undefined, platformId, config.network),
    enabled: !!platformId,
  });

  const { data: subscriptionEvents } = useQuery({
    queryKey: ["subscription-created-events", platformId, config.network],
    queryFn: () => querySubscriptionCreatedEventsByPlatform(platformId, config.network),
    enabled: !!platformId,
  });

  const { data: subscriptionUpdatedEvents } = useQuery({
    queryKey: ["subscription-updated-events", platformId, config.network],
    queryFn: () => querySubscriptionUpdatedEventsByPlatform(platformId, config.network),
    enabled: !!platformId,
  });

  const monthlyRevenue = useMemo(() => {
    if (!monthlyPaymentEvents || monthlyPaymentEvents.length === 0) return "$0.00";

    const total = monthlyPaymentEvents.reduce((sum: number, event: { amount?: string }) => {
      const amount = Number(event.amount || 0);
      return sum + amount / 1_000_000_000;
    }, 0);

    return `$${total.toFixed(2)}`;
  }, [monthlyPaymentEvents]);

  const activeSubscribers = useMemo(() => {
    const onChainCount = Number(fields.subscriber_count) || 0;
    if (onChainCount > 0) return onChainCount;
    
    if (!subscriptionEvents) return 0;
    
    const created = subscriptionEvents.length;
    const cancelled = (subscriptionUpdatedEvents || []).filter(e => e.change_kind === 2).length;
    
    return Math.max(0, created - cancelled);
  }, [fields.subscriber_count, subscriptionEvents, subscriptionUpdatedEvents]);

  const churnRate = useMemo(() => {
    if (activeSubscribers === 0) return "—";
    if (!subscriptionUpdatedEvents) return "—";

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const cancellations = subscriptionUpdatedEvents.filter(
      (e) => e.change_kind === 2 && Number(e.timestamp) >= thirtyDaysAgo
    ).length;

    const rate = cancellations / activeSubscribers;
    return `${(rate * 100).toFixed(1)}%`;
  }, [activeSubscribers, subscriptionUpdatedEvents]);

  const recentActivity: RecentActivityItem[] = useMemo(() => {
    const items: RecentActivityItem[] = [];

    for (const e of allPaymentEvents ?? []) {
      items.push({
        kind: "payment",
        description: "Payment processed",
        amountSui: Number(e.amount || 0) / 1_000_000_000,
        timestamp: Number(e.timestamp),
      });
    }

    for (const e of subscriptionEvents ?? []) {
      items.push({
        kind: "subscription",
        description: "New subscriber",
        amountSui: 0,
        timestamp: Number(e.timestamp),
      });
    }

    return items.sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
  }, [allPaymentEvents, subscriptionEvents]);

  const chartData = useMemo(() => {
    const buckets = buildLastSixMonthBuckets(new Date());
    const events = allPaymentEvents ?? [];

    return buckets.map((bucket) => {
      const totalSui = events
        .filter((e) => {
          const t = Number(e.timestamp);
          return t >= bucket.start && t < bucket.end;
        })
        .reduce((sum, e) => sum + Number(e.amount || 0) / 1_000_000_000, 0);

      return {
        month: bucket.label,
        amount: totalSui,
      };
    });
  }, [allPaymentEvents]);

  const hasChartData = chartData.some((d) => d.amount > 0);
  const maxAmount = Math.max(...chartData.map((d) => d.amount), 1);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="MRR"
          value={calculateMRR(fields.tiers)}
          subtitle="Monthly Recurring Revenue"
          icon={<DollarSign className="h-4 w-4 text-green-600" />}
        />
        <MetricCard
          title="Active Subscribers"
          value={String(activeSubscribers)}
          subtitle="Total subscribers"
          icon={<Users className="h-4 w-4 text-blue-600" />}
        />
        <MetricCard
          title="Monthly Revenue"
          value={monthlyRevenue}
          subtitle="This calendar month"
          icon={<TrendingUp className="h-4 w-4 text-purple-600" />}
        />
        <MetricCard
          title="Churn Rate"
          value={churnRate}
          subtitle="Last 30 days"
          icon={<UserMinus className="h-4 w-4 text-red-600" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue Overview</CardTitle>
          <CardDescription>Last 6 months revenue</CardDescription>
        </CardHeader>
        <CardContent>
          {hasChartData ? (
            <div className="flex items-end justify-between gap-2 h-40">
              {chartData.map((data) => (
                <div key={data.month} className="flex flex-col items-center gap-2 flex-1">
                  <div
                    className="w-full bg-primary rounded-t transition-all hover:bg-primary/80"
                    style={{ height: `${(data.amount / maxAmount) * 100}%` }}
                  />
                  <span className="text-xs text-muted-foreground">{data.month}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">No payments yet — your chart will populate as subscribers pay.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest platform events</CardDescription>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">No payments yet — your dashboard will populate as subscribers pay.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {recentActivity.map((activity, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="p-1.5 rounded-lg bg-muted">
                    {activity.kind === "payment" ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <UserPlus className="h-4 w-4 text-blue-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      {activity.description}
                      {activity.kind === "payment" && `: $${activity.amountSui.toFixed(4)}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatTimeAgo(activity.timestamp)}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {activity.kind === "payment" ? "payment" : "new subscriber"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

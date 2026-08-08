'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import { resolveMerchantDisplayName } from '@noderails/common';
import { useRouter } from 'next/navigation';
import * as api from '@/lib/api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Select as NativeSelect,
  Badge as LegacyBadge,
  Spinner,
} from '@/components/ui';
import { CopyableId } from '@/components/filter-nav';
import {
  CreditCard,
  ArrowUpRight,
  RefreshCw,
  FileText,
  Layers,
  ChevronRight,
  Zap,
  TrendingUp,
  Activity,
  Plus,
  DollarSign,
  BarChart3,
  Globe,
  Coins,
} from 'lucide-react';
import Link from 'next/link';

interface AppInfo {
  id: string;
  name: string;
  environment: string;
}

/* ── Stat Card ── */
function OverviewStatCard({
  title,
  value,
  icon: Icon,
  iconColorClass,
  loading,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColorClass: string;
  loading?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardDescription className="text-xs font-medium tracking-wide uppercase">
          {title}
        </CardDescription>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconColorClass}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <p className="text-3xl font-bold tracking-tight">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardOverview() {
  const { token, merchant, teamMember } = useAuth();
  const router = useRouter();
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string>('all');
  const [stats, setStats] = useState<any>(null);
  const [recentPayments, setRecentPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.getApps(token).then((result) => {
      const list = Array.isArray(result) ? result : [];
      setApps(list);
      // Auto-redirect to first app only on initial login, not when user clicks "Overview"
      const hasVisited = sessionStorage.getItem('nr_visited_overview');
      if (!hasVisited && list.length > 0) {
        sessionStorage.setItem('nr_visited_overview', '1');
        router.replace(`/dashboard/apps/${list[0].id}`);
      }
    }).catch(() => {});
  }, [token, router]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const statsParams: Record<string, string> = {};
    const paymentsParams: Record<string, string> = { pageSize: '5' };
    if (selectedAppId !== 'all') {
      statsParams.appId = selectedAppId;
      paymentsParams.appId = selectedAppId;
    }

    Promise.all([
      api.getStats(token, statsParams).catch(() => null),
      api.getPayments(token, paymentsParams).catch(() => ({ items: [] })),
    ]).then(([statsData, paymentsData]) => {
      setStats(statsData);
      setRecentPayments(paymentsData?.items ?? []);
    }).finally(() => setLoading(false));
  }, [token, selectedAppId]);

  const appOptions = useMemo(() => [
    { value: 'all', label: 'All Apps' },
    ...apps.map((a) => ({ value: a.id, label: a.name })),
  ], [apps]);

  const selectedApp = apps.find((a) => a.id === selectedAppId);
  const welcomeName =
    (merchant ? resolveMerchantDisplayName(merchant) : null) ??
    teamMember?.orgName ??
    null;

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            Welcome back{welcomeName ? `, ${welcomeName}` : ''}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Here&apos;s what&apos;s happening across your payment infrastructure.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <NativeSelect
            options={appOptions}
            value={selectedAppId}
            onChange={(e) => setSelectedAppId(e.target.value)}
            className="w-48"
          />
          {selectedApp && (
            <Badge variant={selectedApp.environment === 'PRODUCTION' ? 'default' : 'secondary'}>
              {selectedApp.environment}
            </Badge>
          )}
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <OverviewStatCard
          title="Total Payments"
          value={String(stats?.totalPayments ?? 0)}
          icon={CreditCard}
          iconColorClass="bg-primary/10 text-primary"
          loading={loading}
        />
        <OverviewStatCard
          title="Captured Volume"
          value={stats?.capturedVolume ? `$${Number(stats.capturedVolume).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00'}
          icon={DollarSign}
          iconColorClass="bg-emerald-500/10 text-emerald-600"
          loading={loading}
        />
        <OverviewStatCard
          title="Active Subscriptions"
          value={String(stats?.activeSubscriptions ?? 0)}
          icon={RefreshCw}
          iconColorClass="bg-amber-500/10 text-amber-600"
          loading={loading}
        />
        <OverviewStatCard
          title="Paid Invoices"
          value={String(stats?.paidInvoices ?? 0)}
          icon={FileText}
          iconColorClass="bg-sky-500/10 text-sky-600"
          loading={loading}
        />
      </div>

      {/* ── Analytics Grid ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Per-Chain Breakdown */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Globe className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">By Network</CardTitle>
                <CardDescription className="text-xs">Payment volume per chain</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : stats?.perChain?.length > 0 ? (
              <div className="space-y-2">
                {stats.perChain.map((chain: any) => {
                  const maxCount = Math.max(...stats.perChain.map((c: any) => c.count));
                  const pct = maxCount > 0 ? (chain.count / maxCount) * 100 : 0;
                  return (
                    <div key={chain.chainId} className="group">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{chain.chainName}</span>
                          <span className="text-[10px] text-muted-foreground/60">({chain.chainId})</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">{chain.count} payments</span>
                          {chain.volume && Number(chain.volume) > 0 && (
                            <span className="text-xs font-medium text-foreground">
                              ${Number(chain.volume).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary/60 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">No payment data yet</p>
            )}
          </CardContent>
        </Card>

        {/* Per-Crypto Breakdown */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
                <Coins className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">By Token</CardTitle>
                <CardDescription className="text-xs">Payment volume per cryptocurrency</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : stats?.perCrypto?.length > 0 ? (
              <div className="space-y-2">
                {stats.perCrypto.map((crypto: any) => {
                  const maxCount = Math.max(...stats.perCrypto.map((c: any) => c.count));
                  const pct = maxCount > 0 ? (crypto.count / maxCount) * 100 : 0;
                  return (
                    <div key={crypto.tokenKey} className="group">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-foreground">{crypto.tokenKey}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">{crypto.count} payments</span>
                          {crypto.volume && Number(crypto.volume) > 0 && (
                            <span className="text-xs font-medium text-foreground">
                              ${Number(crypto.volume).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-amber-500/60 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">No payment data yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Content Grid ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Payments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Activity className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">Recent Payments</CardTitle>
                <CardDescription className="text-xs">Latest payment activity</CardDescription>
              </div>
            </div>
            {selectedAppId !== 'all' && (
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/dashboard/apps/${selectedAppId}/payments`}>
                  View all
                  <ChevronRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            ) : recentPayments.length > 0 ? (
              <div className="space-y-2">
                {recentPayments.slice(0, 5).map((p: any) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/5">
                        <CreditCard className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {p.amount ? `${p.amount} ${p.currency ?? ''}`.trim() : '—'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {p.authorizationMethod ?? 'WALLET'}
                        </p>
                      </div>
                    </div>
                    <LegacyBadge
                      variant={
                        p.status === 'SETTLED'
                          ? 'success'
                          : p.status === 'CAPTURED'
                            ? 'warning'
                            : p.status === 'DISPUTED'
                              ? 'destructive'
                              : 'outline'
                      }
                    >
                      {p.status}
                    </LegacyBadge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center py-10 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted mb-3">
                  <CreditCard className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">No payments yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Payments will appear here once created
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Apps Overview */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Layers className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">Your Apps</CardTitle>
                <CardDescription className="text-xs">{apps.length} app{apps.length !== 1 ? 's' : ''} configured</CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/apps">
                Manage
                <ChevronRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                ))}
              </div>
            ) : apps.length > 0 ? (
              <div className="space-y-2">
                {apps.slice(0, 4).map((app) => (
                  <Link key={app.id} href={`/dashboard/apps/${app.id}`}>
                    <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-muted/50 cursor-pointer">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/5">
                          <Zap className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{app.name}</p>
                          <CopyableId value={app.id} chars={6} />
                        </div>
                      </div>
                      <LegacyBadge variant={app.environment === 'PRODUCTION' ? 'success' : 'outline'}>
                        {app.environment}
                      </LegacyBadge>
                    </div>
                  </Link>
                ))}
                {apps.length > 4 && (
                  <p className="text-center text-xs text-muted-foreground pt-2">
                    +{apps.length - 4} more apps
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center py-10 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted mb-3">
                  <Layers className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">No apps created</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Create an app to start accepting payments
                </p>
                <Button size="sm" className="mt-4" asChild>
                  <Link href="/dashboard/apps">
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Create App
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Quick Actions ── */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Quick Actions
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <QuickAction
            href="/dashboard/apps"
            icon={Layers}
            label="Manage Apps"
            description="View and configure your apps"
          />
          <QuickAction
            href={selectedAppId !== 'all' ? `/dashboard/apps/${selectedAppId}/payments` : '/dashboard/apps'}
            icon={CreditCard}
            label="View Payments"
            description={selectedAppId !== 'all' ? 'See payment intents for this app' : 'Select an app to view payments'}
          />
          <QuickAction
            href="/dashboard/settings"
            icon={RefreshCw}
            label="Settings"
            description="Manage your account settings"
          />
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
  description,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
}) {
  return (
    <Link href={href}>
      <Card className="group transition-all hover:shadow-md hover:border-primary/20 cursor-pointer">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{label}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
        </CardContent>
      </Card>
    </Link>
  );
}

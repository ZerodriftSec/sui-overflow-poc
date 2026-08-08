'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Badge as LegacyBadge,
  Spinner,
  EmptyState,
} from '@/components/ui';
import { CopyableId } from '@/components/filter-nav';
import {
  Link2, Coins, Wallet, Check,
  CreditCard, RefreshCw, FileText, Users,
  AlertTriangle, DollarSign, Globe, Activity, ChevronRight,
  TrendingUp, ArrowDownRight, Banknote,
} from 'lucide-react';
import Link from 'next/link';

/* ── Stat Card (same style as main dashboard) ── */
function OverviewStatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColorClass,
  loading,
}: {
  title: string;
  value: string;
  subtitle?: string;
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
          <>
            <p className="text-3xl font-bold tracking-tight">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function AppDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();

  const [app, setApp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [recentPayments, setRecentPayments] = useState<any[]>([]);


  const loadAll = useCallback(async () => {
    if (!token || !id) return;
    try {
      const appData = await api.getApp(token, id);
      setApp(appData);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  // Load stats separately
  const loadStats = useCallback(async () => {
    if (!token || !id) return;
    setStatsLoading(true);
    try {
      const [statsData, paymentsData] = await Promise.all([
        api.getStats(token, { appId: id }).catch(() => null),
        api.getPayments(token, { appId: id, pageSize: '5' }).catch(() => ({ items: [] })),
      ]);
      setStats(statsData);
      setRecentPayments(paymentsData?.items ?? []);
    } catch {
      /* ignore */
    } finally {
      setStatsLoading(false);
    }
  }, [token, id]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { loadStats(); }, [loadStats]);

  if (loading) return <Spinner />;
  if (!app) return <EmptyState title="App not found" description="This application does not exist or you don't have access." />;

  const fmtCurrency = (v: string | number | null | undefined) => {
    const n = Number(v ?? 0);
    return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-6">
      {/* App Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{app.name}</h1>
          <LegacyBadge variant={app.environment === 'PRODUCTION' ? 'success' : 'outline'}>
            {app.environment === 'PRODUCTION' ? 'Production' : 'Test'}
          </LegacyBadge>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs font-medium text-muted-foreground">App ID:</span>
          <CopyableId value={app.id} chars={10} />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Created {new Date(app.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Testnet Warning Banner */}
      {app.environment === 'TEST' && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">This is a Test App</p>
              <p className="text-sm text-amber-700 mt-0.5">
                Test apps use testnet chains and are meant for development and testing only. 
                Payments made through this app use test tokens with no real value.
                When you&apos;re ready to go live, create a <strong>Production</strong> app to accept real payments on mainnet chains.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Financial Stat Cards ═══ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <OverviewStatCard
          title="Total Payments"
          value={String(stats?.totalPayments ?? 0)}
          subtitle={stats ? `${stats.capturedPayments ?? 0} captured · ${stats.settledPayments ?? 0} settled` : undefined}
          icon={CreditCard}
          iconColorClass="bg-primary/10 text-primary"
          loading={statsLoading}
        />
        <OverviewStatCard
          title="Captured Volume"
          value={fmtCurrency(stats?.capturedVolume)}
          subtitle={stats?.settledVolume && Number(stats.settledVolume) > 0 ? `${fmtCurrency(stats.settledVolume)} settled` : undefined}
          icon={DollarSign}
          iconColorClass="bg-emerald-500/10 text-emerald-600"
          loading={statsLoading}
        />
        <OverviewStatCard
          title="Active Subscriptions"
          value={String(stats?.activeSubscriptions ?? 0)}
          subtitle={stats ? `${stats.totalSubscriptions ?? 0} total` : undefined}
          icon={RefreshCw}
          iconColorClass="bg-amber-500/10 text-amber-600"
          loading={statsLoading}
        />
        <OverviewStatCard
          title="Paid Invoices"
          value={String(stats?.paidInvoices ?? 0)}
          subtitle={stats ? `${stats.totalInvoices ?? 0} total` : undefined}
          icon={FileText}
          iconColorClass="bg-sky-500/10 text-sky-600"
          loading={statsLoading}
        />
      </div>

      {/* ═══ Settled Volume + Refunds + Disputes + Revenue ═══ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <OverviewStatCard
          title="Settled Volume"
          value={fmtCurrency(stats?.settledVolume)}
          icon={Banknote}
          iconColorClass="bg-teal-500/10 text-teal-600"
          loading={statsLoading}
        />
        <OverviewStatCard
          title="Refunded"
          value={String(stats?.refundedPayments ?? 0)}
          icon={ArrowDownRight}
          iconColorClass="bg-rose-500/10 text-rose-600"
          loading={statsLoading}
        />
        <OverviewStatCard
          title="Disputes"
          value={String(stats?.activeDisputes ?? 0)}
          subtitle={stats ? `${stats.totalDisputes ?? 0} total` : undefined}
          icon={AlertTriangle}
          iconColorClass="bg-orange-500/10 text-orange-600"
          loading={statsLoading}
        />
        <OverviewStatCard
          title="MRR"
          value={fmtCurrency(stats?.mrr)}
          subtitle={stats?.arr ? `ARR ${fmtCurrency(stats.arr)}` : undefined}
          icon={TrendingUp}
          iconColorClass="bg-violet-500/10 text-violet-600"
          loading={statsLoading}
        />
      </div>

      {/* ═══ Analytics: By Chain + By Token ═══ */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Per-Chain Breakdown */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Globe className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">Payments by Network</CardTitle>
                <CardDescription className="text-xs">Volume per chain</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : stats?.perChain?.length > 0 ? (
              <div className="space-y-3">
                {stats.perChain.map((chain: any) => {
                  const maxCount = Math.max(...stats.perChain.map((c: any) => c.count));
                  const pct = maxCount > 0 ? (chain.count / maxCount) * 100 : 0;
                  return (
                    <div key={chain.chainId}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{chain.chainName}</span>
                          <span className="text-[10px] text-muted-foreground/60">({chain.chainId})</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">{chain.count} payment{chain.count !== 1 ? 's' : ''}</span>
                          {chain.volume && Number(chain.volume) > 0 && (
                            <span className="text-xs font-medium text-foreground">{fmtCurrency(chain.volume)}</span>
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

        {/* Per-Token Breakdown */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
                <Coins className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">Payments by Token</CardTitle>
                <CardDescription className="text-xs">Volume per cryptocurrency</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : stats?.perCrypto?.length > 0 ? (
              <div className="space-y-3">
                {stats.perCrypto.map((crypto: any) => {
                  const maxCount = Math.max(...stats.perCrypto.map((c: any) => c.count));
                  const pct = maxCount > 0 ? (crypto.count / maxCount) * 100 : 0;
                  return (
                    <div key={crypto.tokenKey}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-foreground">{crypto.tokenKey}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">{crypto.count} payment{crypto.count !== 1 ? 's' : ''}</span>
                          {crypto.volume && Number(crypto.volume) > 0 && (
                            <span className="text-xs font-medium text-foreground">{fmtCurrency(crypto.volume)}</span>
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

      {/* ═══ Recent Payments + Wallets ═══ */}
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
            <Link
              href={`/dashboard/apps/${id}/payments`}
              className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
            >
              View all <ChevronRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
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
                          {p.amount ? `$${Number(p.amount).toFixed(2)} ${p.currency ?? ''}`.trim() : '—'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {p.cryptoTokenKey ?? p.authorizationMethod ?? '—'}
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
                <p className="text-xs text-muted-foreground mt-1">Payments will appear here once created</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Wallets */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                  <Wallet className="h-4 w-4 text-secondary-foreground" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">Wallets</CardTitle>
                  <CardDescription className="text-xs">Configured wallet addresses</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-muted border border-border px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Receiving Wallet</p>
                  <p className="mt-1 font-mono text-xs text-foreground truncate">
                    {app.receivingWallet || <span className="text-muted-foreground/60">Not configured</span>}
                  </p>
                </div>
                <div className="rounded-lg bg-muted border border-border px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Payout Wallet</p>
                  <p className="mt-1 font-mono text-xs text-foreground truncate">
                    {app.payoutWallet || <span className="text-muted-foreground/60">Not configured</span>}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>

      {/* ═══ Quick Links ═══ */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Quick Links</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { href: `/dashboard/apps/${id}/payments`, icon: CreditCard, label: 'Payments', desc: 'View all payment intents' },
            { href: `/dashboard/apps/${id}/subscriptions`, icon: RefreshCw, label: 'Subscriptions', desc: 'Manage recurring billing' },
            { href: `/dashboard/apps/${id}/invoices`, icon: FileText, label: 'Invoices', desc: 'View and send invoices' },
            { href: `/dashboard/apps/${id}/settings`, icon: Link2, label: 'Settings', desc: 'Chains, tokens, webhooks' },
          ].map((item) => (
            <Link key={item.href} href={item.href}>
              <Card className="group transition-all hover:shadow-md hover:border-primary/20 cursor-pointer h-full">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <item.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

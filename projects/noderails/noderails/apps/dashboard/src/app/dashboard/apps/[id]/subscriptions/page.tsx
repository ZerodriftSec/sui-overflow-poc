'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { Badge, Table, Button, Card, Spinner, EmptyState } from '@/components/ui';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { FilterNav, CopyableId } from '@/components/filter-nav';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import Link from 'next/link';
import {
  RefreshCw,
  Plus,
  X,
  AlertTriangle,
  Pause,
  Play,
  Ban,
  ExternalLink,
  Copy,
  Check,
  CreditCard,
  FileText,
  Calendar,
  User,
  Wallet,
} from 'lucide-react';

const statusBadge = (status: string) => {
  const map: Record<string, 'success' | 'warning' | 'destructive' | 'outline'> = {
    ACTIVE: 'success',
    TRIALING: 'success',
    PAUSED: 'warning',
    PAST_DUE: 'destructive',
    CANCELLED: 'destructive',
    CREATED: 'outline',
  };
  return <Badge variant={map[status] ?? 'outline'}>{status}</Badge>;
};

// ── Formatting helpers ──

function formatDateTime(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function timeAgo(dateStr: string) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function truncateId(id: string) {
  return id.length > 12 ? `${id.slice(0, 4)}...${id.slice(-4)}` : id;
}

// ── Reusable detail row ──

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-border/50 last:border-0">
      <span className="text-xs font-medium text-muted-foreground shrink-0 w-36">{label}</span>
      <div className="text-right min-w-0">{children}</div>
    </div>
  );
}

// ── Copyable field ──

function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [value]);

  return (
    <div className="group flex items-center gap-1.5 min-w-0">
      {label && <span className="text-xs text-muted-foreground shrink-0">{label}:</span>}
      <span className="text-xs font-mono text-foreground truncate">{value}</span>
      <button
        onClick={copy}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
        title="Copy"
      >
        {copied ? <Check className="h-3 w-3 text-emerald-700" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
      </button>
    </div>
  );
}

// ── Invoice status badge ──

function InvoiceStatusBadge({ status }: { status: string }) {
  const map: Record<string, 'success' | 'warning' | 'destructive' | 'outline'> = {
    PAID: 'success',
    OPEN: 'warning',
    DRAFT: 'outline',
    VOID: 'outline',
    PAST_DUE: 'destructive',
    UNCOLLECTIBLE: 'destructive',
  };
  return <Badge variant={map[status] ?? 'outline'}>{status}</Badge>;
}

// ── Subscription Detail Panel ──

function SubscriptionDetailPanel({
  subscription: sub,
  onClose,
  onAction,
  onCheckout,
  onRequestCancel,
  actionLoading,
}: {
  subscription: any;
  onClose: () => void;
  onAction: (id: string, action: 'pause' | 'resume' | 'cancel') => void;
  onCheckout: (id: string) => void;
  onRequestCancel: (id: string) => void;
  actionLoading: string | null;
}) {
  const invoices = sub.invoices ?? [];

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="sm:max-w-lg p-0 overflow-y-auto" showCloseButton={false}>
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Subscription Details</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(sub.createdAt)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Amount & Status */}
          <div className="flex items-center justify-between">
            <div>
              {(() => {
                const baseAmount = sub.productPlanPrice?.amount ? Number(sub.productPlanPrice.amount) : null;
                const taxRate = sub.productPlan?.taxRate;
                const hasTax = taxRate && Number(taxRate.percentage) > 0;
                let displayAmount = baseAmount;
                let taxAmount = 0;

                if (baseAmount != null && hasTax) {
                  const pct = Number(taxRate.percentage);
                  if (taxRate.inclusive) {
                    taxAmount = baseAmount - (baseAmount / (1 + pct / 100));
                    displayAmount = baseAmount;
                  } else {
                    taxAmount = baseAmount * (pct / 100);
                    displayAmount = baseAmount + taxAmount;
                  }
                }

                return (
                  <>
                    <p className="text-3xl font-semibold text-foreground">
                      {displayAmount != null ? `$${displayAmount.toFixed(2)}` : '—'}
                    </p>
                    {hasTax && baseAmount != null && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {!taxRate.inclusive && (
                          <span>${baseAmount.toFixed(2)} + </span>
                        )}
                        <span>{taxRate.displayName} {Number(taxRate.percentage)}%</span>
                        {taxRate.inclusive && <span> (incl.)</span>}
                      </p>
                    )}
                  </>
                );
              })()}
              <p className="text-sm text-muted-foreground mt-0.5">
                {sub.productPlanPrice?.currency ?? 'USD'}
                {sub.productPlanPrice?.billingInterval && (
                  <span className="ml-1">
                    / {sub.productPlanPrice.billingInterval.toLowerCase()}
                  </span>
                )}
              </p>
            </div>
            {statusBadge(sub.status)}
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {sub.status === 'CREATED' && (
              <Button
                size="sm"
                onClick={() => onCheckout(sub.id)}
                disabled={actionLoading === sub.id}
              >
                <ExternalLink className="h-3.5 w-3.5" /> Get Checkout URL
              </Button>
            )}
            {sub.status === 'ACTIVE' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onAction(sub.id, 'pause')}
                disabled={actionLoading === sub.id}
              >
                <Pause className="h-3.5 w-3.5" /> Pause
              </Button>
            )}
            {sub.status === 'PAUSED' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onAction(sub.id, 'resume')}
                disabled={actionLoading === sub.id}
              >
                <Play className="h-3.5 w-3.5" /> Resume
              </Button>
            )}
            {['ACTIVE', 'PAUSED', 'PAST_DUE', 'TRIALING'].includes(sub.status) && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onRequestCancel(sub.id)}
                disabled={actionLoading === sub.id}
              >
                <Ban className="h-3.5 w-3.5" /> Cancel
              </Button>
            )}
          </div>

          {/* Identifiers */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Identifiers
            </h3>
            <div className="bg-muted rounded-lg p-3.5 space-y-2">
              <CopyField label="Subscription ID" value={sub.id} />
              {sub.productPlanId && <CopyField label="Plan ID" value={sub.productPlanId} />}
              {sub.productPlanPriceId && <CopyField label="Price ID" value={sub.productPlanPriceId} />}
            </div>
          </div>

          {/* Plan Details */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              <CreditCard className="h-3 w-3 inline-block mr-1" />
              Plan
            </h3>
            <div className="bg-muted rounded-lg p-3.5 space-y-0">
              <DetailRow label="Plan Name">
                <span className="text-sm font-medium text-foreground">
                  {sub.productPlan?.name ?? '—'}
                </span>
              </DetailRow>
              {sub.productPlan?.description && (
                <DetailRow label="Description">
                  <span className="text-sm text-foreground">{sub.productPlan.description}</span>
                </DetailRow>
              )}
              <DetailRow label="Subtotal">
                <span className="text-sm font-medium text-foreground">
                  {sub.productPlanPrice?.amount
                    ? `$${Number(sub.productPlanPrice.amount).toFixed(2)}`
                    : '—'}
                </span>
                <span className="text-xs text-muted-foreground/60 ml-1">
                  {sub.productPlanPrice?.currency ?? 'USD'}
                </span>
              </DetailRow>
              {sub.productPlan?.taxRate && Number(sub.productPlan.taxRate.percentage) > 0 && (() => {
                const base = Number(sub.productPlanPrice?.amount ?? 0);
                const pct = Number(sub.productPlan.taxRate.percentage);
                const inclusive = sub.productPlan.taxRate.inclusive;
                const taxAmt = inclusive
                  ? base - (base / (1 + pct / 100))
                  : base * (pct / 100);
                const total = inclusive ? base : base + taxAmt;
                return (
                  <>
                    <DetailRow label="Tax">
                      <span className="text-sm text-foreground">
                        ${taxAmt.toFixed(2)}
                        <span className="text-xs text-muted-foreground/60 ml-1">
                          ({sub.productPlan.taxRate.displayName} {pct}%{inclusive ? ', incl.' : ''})
                        </span>
                      </span>
                    </DetailRow>
                    <DetailRow label="Total">
                      <span className="text-sm font-semibold text-foreground">
                        ${total.toFixed(2)}
                        <span className="text-xs text-muted-foreground/60 ml-1">
                          {sub.productPlanPrice?.currency ?? 'USD'}
                        </span>
                      </span>
                    </DetailRow>
                  </>
                );
              })()}
              <DetailRow label="Billing Interval">
                <span className="text-sm text-foreground capitalize">
                  {sub.productPlanPrice?.billingInterval?.toLowerCase() ?? '—'}
                </span>
              </DetailRow>
            </div>
          </div>

          {/* Customer */}
          {sub.customerAccount && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                <User className="h-3 w-3 inline-block mr-1" />
                Customer
              </h3>
              <div className="bg-muted rounded-lg p-3.5 space-y-0">
                {sub.customerAccount.email && (
                  <DetailRow label="Email">
                    <span className="text-sm text-foreground">{sub.customerAccount.email}</span>
                  </DetailRow>
                )}
                {sub.customerAccount.name && (
                  <DetailRow label="Name">
                    <span className="text-sm text-foreground">{sub.customerAccount.name}</span>
                  </DetailRow>
                )}
                {sub.customerAccount.externalId && (
                  <DetailRow label="External ID">
                    <CopyField value={sub.customerAccount.externalId} />
                  </DetailRow>
                )}
                <DetailRow label="Customer ID">
                  <CopyField value={sub.customerAccountId ?? sub.customerAccount.id} />
                </DetailRow>
              </div>
            </div>
          )}

          {/* Authorization / Wallet */}
          {sub.customerWallet && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                <Wallet className="h-3 w-3 inline-block mr-1" />
                Authorization
              </h3>
              <div className="bg-muted rounded-lg p-3.5 space-y-0">
                <DetailRow label="Wallet Address">
                  <CopyField value={sub.customerWallet.walletAddress} />
                </DetailRow>
                {sub.authorizationChainId && (
                  <DetailRow label="Chain ID">
                    <span className="text-sm text-foreground">{sub.authorizationChainId}</span>
                  </DetailRow>
                )}
                {sub.authorizationTokenKey && (
                  <DetailRow label="Token">
                    <span className="text-sm font-medium text-foreground">
                      {sub.authorizationTokenKey}
                    </span>
                  </DetailRow>
                )}
                {sub.authorizationMethod && (
                  <DetailRow label="Auth Method">
                    <Badge variant="outline">{sub.authorizationMethod.replace('_', ' ')}</Badge>
                  </DetailRow>
                )}
              </div>
            </div>
          )}

          {/* Billing Cycle */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              <Calendar className="h-3 w-3 inline-block mr-1" />
              Billing Cycle
            </h3>
            <div className="bg-muted rounded-lg p-3.5 space-y-0">
              <DetailRow label="Current Period Start">
                <span className="text-sm text-foreground">{formatDate(sub.currentPeriodStart)}</span>
              </DetailRow>
              <DetailRow label="Current Period End">
                <span className="text-sm text-foreground">{formatDate(sub.currentPeriodEnd)}</span>
              </DetailRow>
              {sub.billingCycleAnchor && (
                <DetailRow label="Billing Anchor">
                  <span className="text-sm text-foreground">{formatDate(sub.billingCycleAnchor)}</span>
                </DetailRow>
              )}
              {sub.trialStart && (
                <DetailRow label="Trial Period">
                  <span className="text-sm text-foreground">
                    {formatDate(sub.trialStart)} → {formatDate(sub.trialEnd)}
                  </span>
                </DetailRow>
              )}
              {sub.status === 'PAST_DUE' && (
                <>
                  <DetailRow label="Past Due Since">
                    <span className="text-sm text-destructive">{formatDate(sub.pastDueSince)}</span>
                  </DetailRow>
                  <DetailRow label="Retry Count">
                    <span className="text-sm text-destructive">
                      {sub.captureRetryCount} / {sub.maxCaptureRetries ?? 3}
                    </span>
                  </DetailRow>
                </>
              )}
              {sub.cancelAtPeriodEnd && (
                <DetailRow label="Cancel At Period End">
                  <Badge variant="warning">Yes</Badge>
                </DetailRow>
              )}
              {sub.cancelledAt && (
                <DetailRow label="Cancelled At">
                  <span className="text-sm text-destructive">{formatDateTime(sub.cancelledAt)}</span>
                </DetailRow>
              )}
              {sub.pausedAt && (
                <DetailRow label="Paused At">
                  <span className="text-sm text-amber-700">{formatDateTime(sub.pausedAt)}</span>
                </DetailRow>
              )}
            </div>
          </div>

          {/* Invoices */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              <FileText className="h-3 w-3 inline-block mr-1" />
              Invoices ({invoices.length})
            </h3>
            {invoices.length === 0 ? (
              <div className="bg-muted rounded-lg p-4 text-center">
                <p className="text-sm text-muted-foreground/60">No invoices yet</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  Invoices are created when subscription charges are processed
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {invoices.map((inv: any) => (
                  <div
                    key={inv.id}
                    className="bg-muted rounded-lg p-3.5 cursor-pointer hover:bg-muted transition-colors"
                    onClick={() => {
                      onClose();
                      window.location.href = `/dashboard/apps/${sub.appId}/invoices?invoiceId=${inv.id}`;
                    }}
                    title="View invoice details"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground">
                          {inv.invoiceNumber}
                        </span>
                        <InvoiceStatusBadge status={inv.status} />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground/60">
                          {timeAgo(inv.createdAt)}
                        </span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground/60" />
                      </div>
                    </div>

                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-foreground">
                        ${Number(inv.total ?? inv.subtotal ?? 0).toFixed(2)}
                        <span className="text-xs text-muted-foreground/60 ml-1">{inv.currency ?? 'USD'}</span>
                      </span>
                      {inv.paidAt && (
                        <span className="text-xs text-emerald-700">
                          Paid {formatDate(inv.paidAt)}
                        </span>
                      )}
                    </div>

                    {/* Tax breakdown */}
                    {inv.taxAmount != null && Number(inv.taxAmount) > 0 && (
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-muted-foreground">
                          Subtotal: ${Number(inv.subtotal ?? 0).toFixed(2)}
                        </span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">
                          Tax: ${Number(inv.taxAmount).toFixed(2)}
                          {inv.taxRate && (
                            <span className="ml-0.5">({inv.taxRate.displayName} {Number(inv.taxRate.percentage)}%{inv.taxRate.inclusive ? ', incl.' : ''})</span>
                          )}
                        </span>
                      </div>
                    )}

                    {(inv.periodStart || inv.periodEnd) && (
                      <p className="text-xs text-muted-foreground/60">
                        Period: {formatDate(inv.periodStart)} → {formatDate(inv.periodEnd)}
                      </p>
                    )}

                    <div className="mt-1.5">
                      <CopyField label="Invoice ID" value={inv.id} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Metadata */}
          {sub.metadata && Object.keys(sub.metadata).length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Metadata
              </h3>
              <div className="bg-muted rounded-lg p-3.5">
                <pre className="text-xs text-secondary-foreground font-mono whitespace-pre-wrap break-all">
                  {JSON.stringify(sub.metadata, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Timeline
            </h3>
            <div className="bg-muted rounded-lg p-3.5 space-y-0">
              <DetailRow label="Created">
                <span className="text-sm text-foreground">{formatDateTime(sub.createdAt)}</span>
              </DetailRow>
              <DetailRow label="Updated">
                <span className="text-sm text-foreground">{formatDateTime(sub.updatedAt)}</span>
              </DetailRow>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function AppSubscriptionsPage() {
  const { id: appId } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [selectedSubscription, setSelectedSubscription] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [appChains, setAppChains] = useState<any[]>([]);
  const [appTokens, setAppTokens] = useState<any[]>([]);
  const [chainsLoaded, setChainsLoaded] = useState(false);

  const [formData, setFormData] = useState({
    customerAccountId: '',
    productPlanId: '',
    productPlanPriceId: '',
  });

  const subscriptionPlans = plans.filter(
    (p: any) => p.planType === 'SUBSCRIPTION' && p.isActive,
  );
  const selectedPlan = plans.find((p: any) => p.id === formData.productPlanId);
  const availablePrices = selectedPlan?.prices?.filter((pr: any) => pr.isActive) ?? [];

  const loadSubscriptions = useCallback(async () => {
    if (!token) return;
    const params: Record<string, string> = { page: String(page), pageSize: '20', appId };
    if (statusFilter) params.status = statusFilter;
    api.getSubscriptions(token, params).then(setData).catch(() => {});
  }, [token, page, appId, statusFilter]);

  useEffect(() => { loadSubscriptions(); }, [loadSubscriptions]);

  useEffect(() => {
    if (!token) return;
    api.getCustomers(token, { pageSize: '100', appId }).then((r) => setCustomers(r.items ?? [])).catch(() => {});
    api.getProductPlans(token, { planType: 'SUBSCRIPTION', pageSize: '100', appId }).then((r) => setPlans(r.items ?? [])).catch(() => {});
    api.getAppChains(token, appId)
      .then((chains) => setAppChains((Array.isArray(chains) ? chains : []).filter((c: any) => c.isEnabled)))
      .catch(() => {})
      .finally(() => setChainsLoaded(true));
    api.getAppTokens(token, appId)
      .then((tokens) => setAppTokens((Array.isArray(tokens) ? tokens : []).filter((t: any) => t.isEnabled)))
      .catch(() => {});
  }, [token, appId]);

  const resetForm = () => {
    setFormData({ customerAccountId: '', productPlanId: '', productPlanPriceId: '' });
    setShowForm(false);
    setError('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError('');
    setSubmitting(true);
    try {
      await api.createSubscription(token, {
        appId,
        customerAccountId: formData.customerAccountId,
        productPlanId: formData.productPlanId,
        productPlanPriceId: formData.productPlanPriceId,
      });
      resetForm();
      await loadSubscriptions();
    } catch (err: any) {
      setError(err.message ?? 'Failed to create subscription');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (id: string, action: 'pause' | 'resume' | 'cancel') => {
    if (!token) return;
    setActionLoading(id);
    try {
      if (action === 'pause') await api.pauseSubscription(token, id);
      else if (action === 'resume') await api.resumeSubscription(token, id);
      else await api.cancelSubscription(token, id, false);
      await loadSubscriptions();
    } catch (err: any) {
      setError(err.message ?? `Failed to ${action} subscription`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCheckout = async (subscriptionId: string) => {
    if (!token) return;
    setActionLoading(subscriptionId);
    setCheckoutUrl(null);
    try {
      const result = await api.createSubscriptionCheckout(token, subscriptionId);
      const paymentUiBase = process.env.NEXT_PUBLIC_PAYMENT_UI_URL ?? 'http://localhost:3002';
      const url = `${paymentUiBase}/checkout/${result.data?.checkoutSessionId ?? result.checkoutSessionId}`;
      setCheckoutUrl(url);
    } catch (err: any) {
      setError(err.message ?? 'Failed to create checkout session');
    } finally {
      setActionLoading(null);
    }
  };

  const copyCheckoutUrl = () => {
    if (checkoutUrl) {
      navigator.clipboard.writeText(checkoutUrl);
    }
  };

  const openDetail = useCallback(async (subscriptionId: string) => {
    if (!token) return;
    setLoadingDetail(true);
    try {
      const result = await api.getSubscription(token, subscriptionId);
      setSelectedSubscription(result.data ?? result);
    } catch {
      setError('Failed to load subscription details');
    } finally {
      setLoadingDetail(false);
    }
  }, [token]);

  // Refresh detail panel after action
  const handleActionAndRefresh = async (id: string, action: 'pause' | 'resume' | 'cancel') => {
    await handleAction(id, action);
    if (selectedSubscription?.id === id) {
      openDetail(id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Subscriptions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Recurring payment subscriptions for this app</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="h-4 w-4" /> New Subscription
        </Button>
      </div>

      <FilterNav
        options={[
          { value: '', label: 'All' },
          { value: 'ACTIVE', label: 'Active' },
          { value: 'CREATED', label: 'Created' },
          { value: 'PAUSED', label: 'Paused' },
          { value: 'PAST_DUE', label: 'Past Due' },
          { value: 'CANCELLED', label: 'Cancelled' },
        ]}
        value={statusFilter}
        onChange={(v) => { setStatusFilter(v); setPage(1); }}
      />

      {chainsLoaded && appChains.length === 0 && (
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 p-4">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">No chains or tokens enabled</p>
            <p className="text-sm text-amber-700 mt-0.5">
              This app has no enabled chains. Subscription checkout will not work until you enable at least one chain and token in the{' '}
              <Link prefetch href={`/dashboard/apps/${appId}/settings?tab=chains`} className="underline font-medium hover:text-amber-900">Chains</Link>{' & '}
              <Link prefetch href={`/dashboard/apps/${appId}/settings?tab=tokens`} className="underline font-medium hover:text-amber-900">Tokens</Link>{' '}
              settings.
            </p>
          </div>
        </div>
      )}

      {chainsLoaded && appChains.length > 0 && appTokens.length === 0 && (
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 p-4">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">No tokens enabled</p>
            <p className="text-sm text-amber-700 mt-0.5">
              This app has chains enabled but no tokens. Subscription checkout will not work until you enable at least one token in{' '}
              <Link prefetch href={`/dashboard/apps/${appId}/settings?tab=tokens`} className="underline font-medium hover:text-amber-900">Tokens</Link>{' '}
              settings.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
      )}

      {checkoutUrl && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-sm text-blue-700 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ExternalLink className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">Checkout URL: {checkoutUrl}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={copyCheckoutUrl} className="rounded-md p-1.5 hover:bg-blue-100 transition-colors" title="Copy URL">
              <Copy className="h-3.5 w-3.5" />
            </button>
            <a href={checkoutUrl} target="_blank" rel="noopener noreferrer" className="rounded-md p-1.5 hover:bg-blue-100 transition-colors" title="Open checkout">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button onClick={() => setCheckoutUrl(null)} className="rounded-md p-1.5 hover:bg-blue-100 transition-colors" title="Dismiss">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">New Subscription</h3>
            <button onClick={resetForm} className="text-muted-foreground/60 hover:text-secondary-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
            {/* Customer Select */}
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-secondary-foreground">Customer</label>
              <select
                className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                value={formData.customerAccountId}
                onChange={(e) => setFormData({ ...formData, customerAccountId: e.target.value })}
                required
              >
                <option value="">Select customer</option>
                {customers.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.email ?? c.name ?? c.externalId ?? c.id.slice(0, 8)}</option>
                ))}
              </select>
              {customers.length === 0 && (
                <p className="text-xs text-muted-foreground/60">No customers found for this app. Create one first.</p>
              )}
            </div>

            {/* Plan Select */}
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-secondary-foreground">Subscription Plan</label>
              <select
                className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                value={formData.productPlanId}
                onChange={(e) => setFormData({ ...formData, productPlanId: e.target.value, productPlanPriceId: '' })}
                required
              >
                <option value="">Select plan</option>
                {subscriptionPlans.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {subscriptionPlans.length === 0 && (
                <p className="text-xs text-muted-foreground/60">No subscription plans. Create one in Product Plans first.</p>
              )}
            </div>

            {/* Price Select */}
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-secondary-foreground">Pricing</label>
              <select
                className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                value={formData.productPlanPriceId}
                onChange={(e) => setFormData({ ...formData, productPlanPriceId: e.target.value })}
                required
                disabled={!formData.productPlanId}
              >
                <option value="">Select pricing</option>
                {availablePrices.map((pr: any) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.amount} {pr.currency ?? 'USD'} / {pr.billingInterval?.toLowerCase() ?? 'month'}
                    {pr.nickname ? ` (${pr.nickname})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={resetForm}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Subscription'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {!data ? (
        <Spinner />
      ) : data.items?.length === 0 ? (
        <EmptyState
          title="No subscriptions yet"
          description="Create a subscription plan first, then subscribe a customer"
          icon={RefreshCw}
          action={<Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> New Subscription</Button>}
        />
      ) : (
        <>
          <Table headers={['Plan', 'Customer', 'Amount', 'Interval', 'Status', 'Next Billing', 'Actions']}>
            {data.items.map((s: any) => (
              <tr key={s.id} className="hover:bg-muted transition-colors cursor-pointer" onClick={() => openDetail(s.id)} title="Click to view details">
                <td className="px-4 py-3.5">
                  <div>
                    <span className="font-medium text-foreground">{s.productPlan?.name ?? '—'}</span>
                    <div className="mt-0.5"><CopyableId value={s.id} chars={6} /></div>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-xs text-muted-foreground">
                  {s.customerAccount?.email ?? s.customerAccount?.name ?? '—'}
                </td>
                <td className="px-4 py-3.5 font-medium text-foreground">
                  {(() => {
                    if (!s.productPlanPrice?.amount) return '—';
                    const base = Number(s.productPlanPrice.amount);
                    const tr = s.productPlan?.taxRate;
                    let total = base;
                    if (tr && Number(tr.percentage) > 0 && !tr.inclusive) {
                      total = base + base * (Number(tr.percentage) / 100);
                    }
                    return `${total.toFixed(2)} ${s.productPlanPrice.currency ?? ''}`.trim();
                  })()}
                </td>
                <td className="px-4 py-3.5 text-muted-foreground capitalize">
                  {s.productPlanPrice?.billingInterval?.toLowerCase() ?? '—'}
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-1.5">
                    {statusBadge(s.status)}
                    {s.status === 'PAST_DUE' && s.captureRetryCount > 0 && (
                      <span className="text-[10px] text-destructive">
                        ({s.captureRetryCount}/{s.maxCaptureRetries ?? 3} retries)
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3.5 text-muted-foreground text-xs">
                  {s.currentPeriodEnd ? new Date(s.currentPeriodEnd).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {s.status === 'CREATED' && (
                      <button
                        onClick={() => handleCheckout(s.id)}
                        disabled={actionLoading === s.id}
                        title="Get Checkout URL"
                        className="rounded-md p-1.5 text-primary hover:text-primary/90 hover:bg-primary/10 transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {s.status === 'ACTIVE' && (
                      <button
                        onClick={() => handleAction(s.id, 'pause')}
                        disabled={actionLoading === s.id}
                        title="Pause"
                        className="rounded-md p-1.5 text-muted-foreground/60 hover:text-amber-700 hover:bg-amber-50 transition-colors"
                      >
                        <Pause className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {s.status === 'PAUSED' && (
                      <button
                        onClick={() => handleAction(s.id, 'resume')}
                        disabled={actionLoading === s.id}
                        title="Resume"
                        className="rounded-md p-1.5 text-muted-foreground/60 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {(s.status === 'ACTIVE' || s.status === 'PAUSED' || s.status === 'PAST_DUE' || s.status === 'TRIALING') && (
                      <button
                        onClick={() => setCancelTargetId(s.id)}
                        disabled={actionLoading === s.id}
                        title="Cancel"
                        className="rounded-md p-1.5 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Ban className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {actionLoading === s.id && (
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border border-border border-t-primary" />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Page {data.page} &middot; {data.total} total</p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button variant="secondary" size="sm" disabled={!data.hasMore} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}

      {/* Loading overlay */}
      {loadingDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10">
          <div className="bg-card rounded-xl p-6 shadow-xl flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
            <span className="text-sm text-muted-foreground">Loading subscription…</span>
          </div>
        </div>
      )}

      {/* Detail panel */}
      {selectedSubscription && !loadingDetail && (
        <SubscriptionDetailPanel
          subscription={selectedSubscription}
          onClose={() => setSelectedSubscription(null)}
          onAction={handleActionAndRefresh}
          onCheckout={handleCheckout}
          onRequestCancel={(id) => setCancelTargetId(id)}
          actionLoading={actionLoading}
        />
      )}

      <ConfirmDialog
        open={!!cancelTargetId}
        onOpenChange={(open) => !open && setCancelTargetId(null)}
        title="Cancel Subscription"
        description="Cancel this subscription? This cannot be undone."
        confirmLabel="Cancel Subscription"
        onConfirm={() => {
          if (cancelTargetId) {
            handleAction(cancelTargetId, 'cancel');
            if (selectedSubscription?.id === cancelTargetId) openDetail(cancelTargetId);
            setCancelTargetId(null);
          }
        }}
      />
    </div>
  );
}

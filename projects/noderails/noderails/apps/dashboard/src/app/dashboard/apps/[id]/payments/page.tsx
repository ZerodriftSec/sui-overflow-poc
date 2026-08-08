'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { Badge, Table, Spinner, EmptyState, Button, Select, Card } from '@/components/ui';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { FilterNav, CopyableId } from '@/components/filter-nav';
import {
  CreditCard,
  Copy,
  Check,
  ExternalLink,
  X,
  User,
  MapPin,
  Undo2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { formatCryptoAmount, parseTokenKey, blockExplorerTxUrl, blockExplorerAddressUrl, chainDisplayName } from '@noderails/common';
import { useChainRegistry } from '@/lib/use-chain-registry';

// ── Status badge ──

const statusConfig: Record<string, { variant: 'success' | 'warning' | 'destructive' | 'outline' | 'default'; label: string }> = {
  CREATED: { variant: 'outline', label: 'Created' },
  AUTHORIZED: { variant: 'default', label: 'Authorized' },
  CAPTURING: { variant: 'warning', label: 'Capturing' },
  CAPTURED: { variant: 'success', label: 'Captured' },
  SETTLED: { variant: 'success', label: 'Settled' },
  CAPTURE_FAILED: { variant: 'destructive', label: 'Capture Failed' },
  PAST_DUE: { variant: 'warning', label: 'Past Due' },
  DISPUTED: { variant: 'destructive', label: 'Disputed' },
  DISPUTE_RESOLVED: { variant: 'success', label: 'Dispute Resolved' },
  DISPUTE_LOST: { variant: 'destructive', label: 'Dispute Lost' },
  REFUNDED: { variant: 'destructive', label: 'Refunded' },
  CANCELLED: { variant: 'outline', label: 'Cancelled' },
  EXPIRED: { variant: 'outline', label: 'Expired' },
};

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? { variant: 'outline' as const, label: status };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

// ── Transaction status badge ──

function TxStatusBadge({ status }: { status: string }) {
  const map: Record<string, 'success' | 'warning' | 'destructive' | 'outline'> = {
    PENDING: 'warning',
    CONFIRMED: 'success',
    FAILED: 'destructive',
  };
  return <Badge variant={map[status] ?? 'outline'}>{status}</Badge>;
}

// ── Source type helpers ──

const SOURCE_TYPE_LABELS: Record<string, string> = {
  PAYMENT_LINK: 'Payment Link',
  INVOICE: 'Invoice',
  SUBSCRIPTION: 'Subscription',
  API: 'API',
  CHECKOUT_SESSION: 'Checkout',
};

function getSourceInfo(payment: any): { label: string; sourceId?: string } {
  // Prefer the PaymentIntent's own sourceType (always correct for subscriptions)
  if (payment.sourceType) {
    return {
      label: SOURCE_TYPE_LABELS[payment.sourceType] ?? payment.sourceType,
      sourceId: payment.sourceId ?? undefined,
    };
  }
  // Fall back to checkout session source info
  const cs = payment.checkoutSessions?.[0];
  if (cs?.sourceType && cs.sourceType !== 'API') {
    return {
      label: SOURCE_TYPE_LABELS[cs.sourceType] ?? cs.sourceType,
      sourceId: cs.sourceId ?? undefined,
    };
  }
  if (cs?.sourceType === 'API') {
    return { label: 'API' };
  }
  return { label: '—' };
}

function SourceBadge({ payment }: { payment: any }) {
  const { label } = getSourceInfo(payment);
  const variantMap: Record<string, 'default' | 'outline' | 'success' | 'warning' | 'destructive'> = {
    'Payment Link': 'default',
    Invoice: 'warning',
    Subscription: 'success',
    API: 'outline',
    Checkout: 'outline',
  };
  return <Badge variant={variantMap[label] ?? 'outline'}>{label}</Badge>;
}

// ── Copyable field ──

function CopyField({ value, label, mono = true }: { value: string; label?: string; mono?: boolean }) {
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
      <span className={`text-sm text-foreground truncate ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </span>
      <button
        onClick={copy}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
        title="Copy"
      >
        {copied ? (
          <Check className="h-3 w-3 text-emerald-700" />
        ) : (
          <Copy className="h-3 w-3 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}

// ── Truncate hash for display ──

function truncateHash(hash: string, startLen = 4, endLen = 4) {
  if (hash.length <= startLen + endLen + 3) return hash;
  return `${hash.slice(0, startLen)}...${hash.slice(-endLen)}`;
}

// ── Format date/time ──

function formatDateTime(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Time ago ──

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

// ── Detail row ──

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-border/50 last:border-0">
      <span className="text-xs font-medium text-muted-foreground shrink-0 w-36">{label}</span>
      <div className="text-right min-w-0">{children}</div>
    </div>
  );
}

// ── Detail panel ──

function PaymentDetailPanel({
  payment,
  onClose,
  onRefundSuccess,
}: {
  payment: any;
  onClose: () => void;
  onRefundSuccess: () => void;
}) {
  const { token } = useAuth();
  const { registry: chainRegistry } = useChainRegistry();
  const chainId = payment.authorizationChainId;
  const hasChain = chainId != null;
  const tokenInfo = parseTokenKey(payment.cryptoTokenKey);
  const transactions = payment.transactions ?? [];

  // Refund modal state
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundError, setRefundError] = useState('');

  // Determine if refund is possible
  const canRefund = payment.status === 'CAPTURED' && (() => {
    if (payment.timelockEndsAt) {
      return new Date() < new Date(payment.timelockEndsAt);
    }
    if (payment.capturedAt && payment.timelockDuration) {
      const settlementTime = new Date(new Date(payment.capturedAt).getTime() + payment.timelockDuration * 1000);
      return new Date() < settlementTime;
    }
    return false;
  })();

  const handleRefund = async () => {
    if (!token || !refundReason.trim()) return;
    setRefundLoading(true);
    setRefundError('');
    try {
      await api.refundPayment(token, payment.id, refundReason.trim());
      setShowRefundModal(false);
      setRefundReason('');
      onRefundSuccess();
    } catch (err: any) {
      setRefundError(err.message ?? 'Failed to initiate refund');
    } finally {
      setRefundLoading(false);
    }
  };

  // Sort transactions by creation, newest first
  const sortedTxs = [...transactions].sort(
    (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="sm:max-w-lg p-0 overflow-y-auto" showCloseButton={false}>
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Payment Details</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatDateTime(payment.createdAt)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Amount & status header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-semibold text-foreground">
                {payment.amount ? `$${Number(payment.amount).toFixed(2)}` : '—'}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">{payment.currency ?? 'USD'}</p>
            </div>
            <StatusBadge status={payment.status} />
          </div>

          {/* Identifiers */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Identifiers
            </h3>
            <div className="bg-muted rounded-lg p-3.5 space-y-2">
              <CopyField label="Payment ID" value={payment.id} />
              {payment.externalId && (
                <CopyField label="External ID" value={payment.externalId} />
              )}
              {payment.idempotencyKey && (
                <CopyField label="Idempotency" value={payment.idempotencyKey} />
              )}
            </div>
          </div>

          {/* Refund button — shown for captured payments within timelock window */}
          {canRefund && (
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => setShowRefundModal(true)}
            >
              <Undo2 className="h-3.5 w-3.5 mr-1.5" />
              Refund Payment
            </Button>
          )}

          {/* Refund info — shown for refunded payments */}
          {payment.status === 'REFUNDED' && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Refund Details
              </h3>
              <div className="bg-destructive/10 rounded-lg p-3.5 space-y-0 border border-destructive/30">
                {payment.refundReason && (
                  <DetailRow label="Reason">
                    <span className="text-sm text-foreground">{payment.refundReason}</span>
                  </DetailRow>
                )}
                {payment.refundedAt && (
                  <DetailRow label="Refunded At">
                    <span className="text-sm text-foreground">{formatDateTime(payment.refundedAt)}</span>
                  </DetailRow>
                )}
                {payment.refundTxHash && (
                  <DetailRow label="Refund Tx">
                    <div className="flex items-center gap-1.5">
                      <CopyField value={payment.refundTxHash} />
                      {chainId != null && blockExplorerTxUrl(chainId, payment.refundTxHash, chainRegistry) && (
                        <a
                          href={blockExplorerTxUrl(chainId, payment.refundTxHash, chainRegistry) ?? '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
                          title="View on explorer"
                        >
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </a>
                      )}
                    </div>
                  </DetailRow>
                )}
              </div>
            </div>
          )}

          {/* Tax Breakdown — shown when checkout session had tax */}
          {(() => {
            const cs = payment.checkoutSessions?.[0];
            if (!cs?.taxAmount || Number(cs.taxAmount) <= 0) return null;
            return (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Tax
                </h3>
                <div className="bg-muted rounded-lg p-3.5 space-y-0">
                  {cs.taxDescription && (
                    <DetailRow label="Tax">
                      <span className="text-sm text-foreground">{cs.taxDescription}</span>
                    </DetailRow>
                  )}
                  <DetailRow label="Subtotal">
                    <span className="text-sm text-foreground">
                      ${Number(cs.subtotal).toFixed(2)}
                    </span>
                  </DetailRow>
                  <DetailRow label="Tax Amount">
                    <span className="text-sm text-muted-foreground">
                      +${Number(cs.taxAmount).toFixed(2)}
                    </span>
                  </DetailRow>
                  <DetailRow label="Total">
                    <span className="text-sm font-medium text-foreground">
                      ${payment.amount ? Number(payment.amount).toFixed(2) : '—'}
                    </span>
                  </DetailRow>
                </div>
              </div>
            );
          })()}

          {/* Platform Fee Breakdown — shown for captured/settled payments */}
          {payment.platformFeeBps != null && payment.platformFeeBps > 0 && payment.cryptoAmount && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Fee Breakdown
              </h3>
              <div className="bg-muted rounded-lg p-3.5 space-y-0">
                <DetailRow label="Platform Fee">
                  <span className="text-sm text-foreground">
                    {(payment.platformFeeBps / 100).toFixed(2).replace(/\.?0+$/, '')}%
                    <span className="text-xs text-muted-foreground/60 ml-1">({payment.platformFeeBps} bps)</span>
                  </span>
                </DetailRow>
                {payment.amount && (
                  <>
                    <DetailRow label="Fee Amount">
                      <span className="text-sm text-muted-foreground">
                        ${((Number(payment.amount) * payment.platformFeeBps) / 10000).toFixed(2)}
                      </span>
                    </DetailRow>
                    <DetailRow label="Net to You">
                      <span className="text-sm font-medium text-emerald-700">
                        ${(Number(payment.amount) * (1 - payment.platformFeeBps / 10000)).toFixed(2)}
                      </span>
                    </DetailRow>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Customer */}
          {payment.customerAccount && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Customer
              </h3>
              <div className="bg-muted rounded-lg p-3.5 space-y-0">
                {payment.customerAccount.email && (
                  <DetailRow label="Email">
                    <CopyField value={payment.customerAccount.email} mono={false} />
                  </DetailRow>
                )}
                {payment.customerAccount.name && (
                  <DetailRow label="Name">
                    <span className="text-sm text-foreground">{payment.customerAccount.name}</span>
                  </DetailRow>
                )}
                {payment.customerAccount.address && (
                  <DetailRow label="Address">
                    <span className="text-sm text-foreground">{payment.customerAccount.address}</span>
                  </DetailRow>
                )}
                {(payment.customerAccount.city || payment.customerAccount.state || payment.customerAccount.postalCode) && (
                  <DetailRow label="City / State / Zip">
                    <span className="text-sm text-foreground">
                      {[payment.customerAccount.city, payment.customerAccount.state, payment.customerAccount.postalCode].filter(Boolean).join(', ')}
                    </span>
                  </DetailRow>
                )}
                {payment.customerAccount.country && (
                  <DetailRow label="Country">
                    <span className="text-sm text-foreground">{payment.customerAccount.country}</span>
                  </DetailRow>
                )}
              </div>
            </div>
          )}

          {/* Crypto payment details */}
          {(hasChain || tokenInfo || payment.authorizationWalletAddress) && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Crypto Payment
              </h3>
              <div className="bg-muted rounded-lg p-3.5 space-y-0">
                {hasChain && (
                  <DetailRow label="Network">
                    <span className="text-sm text-foreground">{chainDisplayName(chainId, chainRegistry)}</span>
                    <span className="text-xs text-muted-foreground/60 ml-1.5">({chainId})</span>
                  </DetailRow>
                )}
                {tokenInfo && (
                  <DetailRow label="Token">
                    <span className="text-sm font-medium text-foreground">{tokenInfo.symbol}</span>
                  </DetailRow>
                )}
                {payment.cryptoAmount && (
                  <DetailRow label="Crypto Amount">
                    <span className="text-sm font-mono text-foreground">
                      {formatCryptoAmount(payment.cryptoAmount, payment.cryptoTokenDecimals)}
                    </span>
                    {tokenInfo && (
                      <span className="text-xs text-muted-foreground/60 ml-1">{tokenInfo.symbol}</span>
                    )}
                  </DetailRow>
                )}
                {payment.exchangeRate && (
                  <DetailRow label="Exchange Rate">
                    <span className="text-sm font-mono text-foreground">
                      {Number(payment.exchangeRate).toFixed(6)}
                    </span>
                  </DetailRow>
                )}
                {payment.authorizationMethod && (
                  <DetailRow label="Auth Method">
                    <Badge variant="outline">{payment.authorizationMethod.replace('_', ' ')}</Badge>
                  </DetailRow>
                )}
                {payment.authorizationWalletAddress && (
                  <DetailRow label="Payer Wallet">
                    <div className="flex items-center gap-1.5">
                      <CopyField value={payment.authorizationWalletAddress} />
                      {hasChain && blockExplorerAddressUrl(chainId, payment.authorizationWalletAddress, chainRegistry) && (
                        <a
                          href={blockExplorerAddressUrl(chainId, payment.authorizationWalletAddress, chainRegistry) ?? '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
                          title="View on explorer"
                        >
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </a>
                      )}
                    </div>
                  </DetailRow>
                )}
                {payment.authorizationTxHash && (
                  <DetailRow label="Auth Tx">
                    <div className="flex items-center gap-1.5">
                      <CopyField value={payment.authorizationTxHash} />
                      {hasChain && blockExplorerTxUrl(chainId, payment.authorizationTxHash, chainRegistry) && (
                        <a
                          href={blockExplorerTxUrl(chainId, payment.authorizationTxHash, chainRegistry) ?? '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
                          title="View on explorer"
                        >
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </a>
                      )}
                    </div>
                  </DetailRow>
                )}
                {payment.captureTxHash && (
                  <DetailRow label="Capture Tx">
                    <div className="flex items-center gap-1.5">
                      <CopyField value={payment.captureTxHash} />
                      {hasChain && blockExplorerTxUrl(chainId, payment.captureTxHash, chainRegistry) && (
                        <a
                          href={blockExplorerTxUrl(chainId, payment.captureTxHash, chainRegistry) ?? '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
                          title="View on explorer"
                        >
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </a>
                      )}
                    </div>
                  </DetailRow>
                )}
              </div>
            </div>
          )}

          {/* Timeline / key dates */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Timeline
            </h3>
            <div className="bg-muted rounded-lg p-3.5 space-y-0">
              <DetailRow label="Created">
                <span className="text-sm text-foreground">{formatDateTime(payment.createdAt)}</span>
              </DetailRow>
              {payment.authorizedAt && (
                <DetailRow label="Authorized">
                  <span className="text-sm text-foreground">{formatDateTime(payment.authorizedAt)}</span>
                </DetailRow>
              )}
              {payment.capturedAt && (
                <DetailRow label="Captured">
                  <span className="text-sm text-foreground">{formatDateTime(payment.capturedAt)}</span>
                </DetailRow>
              )}
              {payment.settledAt && (
                <DetailRow label="Settled">
                  <span className="text-sm text-foreground">{formatDateTime(payment.settledAt)}</span>
                </DetailRow>
              )}
              {payment.refundedAt && (
                <DetailRow label="Refunded">
                  <span className="text-sm text-destructive">{formatDateTime(payment.refundedAt)}</span>
                </DetailRow>
              )}
              {payment.expiresAt && (
                <DetailRow label="Expires">
                  <span className="text-sm text-foreground">{formatDateTime(payment.expiresAt)}</span>
                </DetailRow>
              )}
              {payment.timelockEndsAt && (
                <DetailRow label="Timelock Ends">
                  <span className="text-sm text-foreground">{formatDateTime(payment.timelockEndsAt)}</span>
                </DetailRow>
              )}
            </div>
          </div>

          {/* Configuration */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Configuration
            </h3>
            <div className="bg-muted rounded-lg p-3.5 space-y-0">
              <DetailRow label="Capture Mode">
                <Badge variant="outline">{payment.captureMode ?? 'AUTOMATIC'}</Badge>
              </DetailRow>
              {(() => {
                const src = getSourceInfo(payment);
                return (
                  <DetailRow label="Source">
                    <SourceBadge payment={payment} />
                    {src.sourceId && (
                      <span className="text-xs text-muted-foreground/60 ml-1">
                        (<CopyableId value={src.sourceId} chars={4} />)
                      </span>
                    )}
                  </DetailRow>
                );
              })()}
              {payment.captureAttempts > 0 && (
                <DetailRow label="Capture Attempts">
                  <span className="text-sm text-foreground">{payment.captureAttempts}</span>
                </DetailRow>
              )}
            </div>
          </div>

          {/* Transactions */}
          {sortedTxs.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Transactions ({sortedTxs.length})
              </h3>
              <div className="space-y-2">
                {sortedTxs.map((tx: any) => (
                  <div key={tx.id} className="bg-muted rounded-lg p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{tx.type}</Badge>
                        <TxStatusBadge status={tx.status} />
                      </div>
                      <span className="text-xs text-muted-foreground/60">
                        {timeAgo(tx.createdAt)}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <CopyField label="Tx ID" value={tx.id} />
                      {tx.txHash && (
                        <div className="flex items-center gap-1.5">
                          <CopyField label="Hash" value={tx.txHash} />
                          {(() => {
                            const url = chainId != null ? blockExplorerTxUrl(chainId, tx.txHash, chainRegistry) : null;
                            return url ? (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
                                title="View on explorer"
                              >
                                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                              </a>
                            ) : null;
                          })()}
                        </div>
                      )}
                      {tx.mtxmTxId && (
                        <CopyField label="MTXM ID" value={tx.mtxmTxId} />
                      )}
                      {tx.chain && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground shrink-0">Chain:</span>
                          <span className="text-xs text-foreground">{tx.chain}</span>
                        </div>
                      )}
                      {tx.error && (
                        <div className="mt-1 text-xs text-destructive bg-destructive/10 rounded px-2 py-1">
                          {tx.error}
                        </div>
                      )}
                      {tx.confirmedAt && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">Confirmed:</span>
                          <span className="text-xs text-foreground">
                            {formatDateTime(tx.confirmedAt)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          {payment.metadata && Object.keys(payment.metadata).length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Metadata
              </h3>
              <div className="bg-muted rounded-lg p-3.5">
                <pre className="text-xs text-secondary-foreground font-mono whitespace-pre-wrap break-all">
                  {JSON.stringify(payment.metadata, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

      {/* Refund Modal */}
      {showRefundModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => !refundLoading && setShowRefundModal(false)} />
          <div className="relative bg-card rounded-xl shadow-2xl w-full max-w-md p-6 mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Refund Payment</h3>
                <p className="text-xs text-muted-foreground">
                  ${payment.amount ? Number(payment.amount).toFixed(2) : '0.00'} {payment.currency ?? 'USD'}
                </p>
              </div>
            </div>

            <p className="text-sm text-secondary-foreground mb-4">
              This will initiate an on-chain refund transaction. The full amount will be returned to the
              payer&apos;s wallet. This action cannot be undone.
            </p>

            <div className="space-y-3 mb-5">
              <label className="block text-sm font-medium text-foreground">
                Reason for refund <span className="text-destructive">*</span>
              </label>
              <textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="e.g. Customer requested refund, duplicate payment, service not provided..."
                className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                rows={3}
                maxLength={500}
                disabled={refundLoading}
              />
              <p className="text-[10px] text-muted-foreground/60 text-right">{refundReason.length}/500</p>
            </div>

            {refundError && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-600 mb-4 flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {refundError}
              </div>
            )}

            <div className="flex items-center gap-2 justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setShowRefundModal(false); setRefundError(''); }}
                disabled={refundLoading}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRefund}
                disabled={refundLoading || !refundReason.trim()}
              >
                {refundLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Undo2 className="h-3.5 w-3.5 mr-1.5" />
                    Confirm Refund
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
      </SheetContent>
    </Sheet>
  );
}

export default function AppPaymentsPage() {
  const { id: appId } = useParams<{ id: string }>();
  const { token } = useAuth();
  const { registry: chainRegistry } = useChainRegistry();
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!token) return;
    const params: Record<string, string> = { page: String(page), pageSize: '20', appId };
    if (statusFilter) params.status = statusFilter;
    api.getPayments(token, params).then(setData).catch(() => {});
  }, [token, page, statusFilter, appId]);

  const openDetail = useCallback(async (paymentId: string) => {
    if (!token) return;
    setLoadingDetail(true);
    try {
      const detail = await api.getPayment(token, paymentId);
      setSelectedPayment(detail);
    } catch {
      // fallback: use list data
      const fromList = data?.items?.find((p: any) => p.id === paymentId);
      if (fromList) setSelectedPayment(fromList);
    } finally {
      setLoadingDetail(false);
    }
  }, [token, data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
            <p className="text-sm text-muted-foreground">
              Payment intents for this app
              {data?.total != null && <span className="ml-1">({data.total})</span>}
            </p>
          </div>
        </div>
        <FilterNav
          options={[
            { value: '', label: 'All' },
            { value: 'CREATED', label: 'Created' },
            { value: 'AUTHORIZED', label: 'Authorized' },
            { value: 'CAPTURING', label: 'Capturing' },
            { value: 'CAPTURED', label: 'Captured' },
            { value: 'SETTLED', label: 'Settled' },
            { value: 'CAPTURE_FAILED', label: 'Failed' },
            { value: 'REFUNDED', label: 'Refunded' },
            { value: 'CANCELLED', label: 'Cancelled' },
            { value: 'EXPIRED', label: 'Expired' },
          ]}
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(1); }}
        />
      </div>

      {!data ? (
        <Spinner />
      ) : data.items?.length === 0 ? (
        <EmptyState
          title="No payments yet"
          description="Payment intents will appear here when created via the API or checkout"
          icon={CreditCard}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-[10px] border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Payment</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Crypto</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Network</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Capture Tx</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {data.items.map((p: any) => {
                  const chainId = p.authorizationChainId as number | null | undefined;
                  const tokenInfo = parseTokenKey(p.cryptoTokenKey);
                  const captureTx = p.transactions?.find((t: any) => t.type === 'CAPTURE');
                  const txHash = captureTx?.txHash || p.captureTxHash;

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-muted transition-colors cursor-pointer group"
                      onClick={() => openDetail(p.id)}
                      title="Click to view details"
                    >
                      {/* Payment ID */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                            <CreditCard className="h-3.5 w-3.5 text-secondary-foreground" />
                          </div>
                          <div>
                            <CopyableId value={p.id} chars={6} />
                            {p.externalId && (
                              <p className="text-[10px] text-muted-foreground/60 mt-0.5">{p.externalId}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Fiat amount */}
                      <td className="px-4 py-3.5">
                        <span className="font-medium text-foreground">
                          {p.amount ? `$${Number(p.amount).toFixed(2)}` : '—'}
                        </span>
                        <span className="text-xs text-muted-foreground/60 ml-1">{p.currency ?? ''}</span>
                      </td>

                      {/* Customer */}
                      <td className="px-4 py-3.5">
                        {p.customerAccount?.email ? (
                          <div>
                            <span className="text-sm text-foreground">{p.customerAccount.name ?? p.customerAccount.email}</span>
                            {p.customerAccount.name && (
                              <p className="text-[10px] text-muted-foreground/60 mt-0.5">{p.customerAccount.email}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>

                      {/* Crypto token + amount */}
                      <td className="px-4 py-3.5">
                        {tokenInfo ? (
                          <div>
                            <span className="text-sm font-medium text-foreground">
                              {p.cryptoAmount
                                ? formatCryptoAmount(p.cryptoAmount, p.cryptoTokenDecimals)
                                : '—'}
                            </span>
                            <span className="text-xs text-muted-foreground/60 ml-1">{tokenInfo.symbol}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>

                      {/* Chain */}
                      <td className="px-4 py-3.5">
                        {chainId != null ? (
                          <span className="text-sm text-secondary-foreground">{chainDisplayName(chainId, chainRegistry)}</span>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>

                      {/* Source */}
                      <td className="px-4 py-3.5">
                        <SourceBadge payment={p} />
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <StatusBadge status={p.status} />
                      </td>

                      {/* Capture tx hash */}
                      <td className="px-4 py-3.5">
                        {txHash ? (
                          <div className="flex items-center gap-1">
                            <CopyableId value={txHash} chars={4} />
                            {chainId != null && blockExplorerTxUrl(chainId, txHash, chainRegistry) && (
                              <a
                                href={blockExplorerTxUrl(chainId, txHash, chainRegistry) ?? '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-0.5 rounded hover:bg-muted transition-colors"
                                title="View on explorer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>

                      {/* Created */}
                      <td className="px-4 py-3.5">
                        <div>
                          <span className="text-xs text-muted-foreground">{formatDate(p.createdAt)}</span>
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">{timeAgo(p.createdAt)}</p>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Page {data.page} of {data.totalPages ?? Math.ceil(data.total / 20)} &middot; {data.total} total
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <Button variant="secondary" size="sm" disabled={!data.hasMore} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Detail drawer */}
      {selectedPayment && (
        <PaymentDetailPanel
          payment={selectedPayment}
          onClose={() => setSelectedPayment(null)}
          onRefundSuccess={async () => {
            // Refresh the detail panel and the list
            if (token) {
              try {
                const updated = await api.getPayment(token, selectedPayment.id);
                setSelectedPayment(updated);
              } catch {
                setSelectedPayment(null);
              }
              const params: Record<string, string> = { page: String(page), pageSize: '20', appId };
              if (statusFilter) params.status = statusFilter;
              api.getPayments(token, params).then(setData).catch(() => {});
            }
          }}
        />
      )}

      {/* Loading overlay for detail */}
      {loadingDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10">
          <div className="bg-card rounded-xl p-6 shadow-lg">
            <Spinner />
          </div>
        </div>
      )}
    </div>
  );
}

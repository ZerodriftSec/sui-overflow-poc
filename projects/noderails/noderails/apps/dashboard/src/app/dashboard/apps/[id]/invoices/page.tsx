'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { Badge, Table, Button, Card, Input, Textarea, Spinner, EmptyState } from '@/components/ui';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { FilterNav, CopyableId } from '@/components/filter-nav';
import {
  FileText, Plus, X, Send, Ban, Trash2, Link2, Check, UserPlus, Users,
  Copy, ExternalLink, CreditCard,
} from 'lucide-react';
import { formatCryptoAmount, parseTokenKey, blockExplorerTxUrl, blockExplorerAddressUrl, chainDisplayName } from '@noderails/common';

function truncateHash(hash: string, startLen = 4, endLen = 4) {
  if (hash.length <= startLen + endLen + 3) return hash;
  return `${hash.slice(0, startLen)}...${hash.slice(-endLen)}`;
}

function formatDateTime(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Status badge ──

const statusBadge = (status: string) => {
  const map: Record<string, 'success' | 'warning' | 'destructive' | 'outline'> = {
    PAID: 'success',
    OPEN: 'warning',
    OVERDUE: 'destructive',
    DRAFT: 'outline',
    VOID: 'outline',
    UNCOLLECTIBLE: 'destructive',
  };
  return <Badge variant={map[status] ?? 'outline'}>{status}</Badge>;
};

function PaymentStatusBadge({ status }: { status: string }) {
  const map: Record<string, 'success' | 'warning' | 'destructive' | 'outline' | 'default'> = {
    CREATED: 'outline', AUTHORIZED: 'default', CAPTURING: 'warning',
    CAPTURED: 'success', SETTLED: 'success', CAPTURE_FAILED: 'destructive',
    EXPIRED: 'outline', CANCELLED: 'outline',
  };
  return <Badge variant={map[status] ?? 'outline'}>{status}</Badge>;
}

function TxStatusBadge({ status }: { status: string }) {
  const map: Record<string, 'success' | 'warning' | 'destructive' | 'outline'> = {
    PENDING: 'warning', CONFIRMED: 'success', FAILED: 'destructive',
  };
  return <Badge variant={map[status] ?? 'outline'}>{status}</Badge>;
}

// ── Copyable field ──

function CopyField({ value, label, mono = true }: { value: string; label?: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }, [value]);
  return (
    <div className="group flex items-center gap-1.5 min-w-0">
      {label && <span className="text-xs text-muted-foreground shrink-0">{label}:</span>}
      <span className={`text-sm text-foreground truncate ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
      <button onClick={copy} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted" title="Copy">
        {copied ? <Check className="h-3 w-3 text-emerald-700" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
      </button>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-border/50 last:border-0">
      <span className="text-xs font-medium text-muted-foreground shrink-0 w-36">{label}</span>
      <div className="text-right min-w-0">{children}</div>
    </div>
  );
}

// ── Invoice Detail Panel (slide-out drawer) ──

function InvoiceDetailPanel({ invoice, onClose }: { invoice: any; onClose: () => void }) {
  const pi = invoice.paymentIntent;
  const chainId = pi?.authorizationChainId;
  const hasChain = chainId != null;
  const tokenInfo = parseTokenKey(pi?.cryptoTokenKey);
  const transactions = pi?.transactions ?? [];
  const sortedTxs = [...transactions].sort(
    (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="sm:max-w-lg p-0 overflow-y-auto" showCloseButton={false}>
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Invoice {invoice.invoiceNumber ?? ''}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(invoice.createdAt)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Amount & status */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-semibold text-foreground">
                {invoice.total ? `${Number(invoice.total).toFixed(2)}` : '—'}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">{invoice.currency ?? 'USD'}</p>
            </div>
            {statusBadge(invoice.status)}
          </div>

          {/* Identifiers */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Identifiers</h3>
            <div className="bg-muted rounded-lg p-3.5 space-y-2">
              <CopyField label="Invoice ID" value={invoice.id} />
              {pi && <CopyField label="Payment ID" value={pi.id} />}
            </div>
          </div>

          {/* Customer */}
          {invoice.customerAccount && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Customer</h3>
              <div className="bg-muted rounded-lg p-3.5 space-y-0">
                {invoice.customerAccount.email && (
                  <DetailRow label="Email">
                    <CopyField value={invoice.customerAccount.email} mono={false} />
                  </DetailRow>
                )}
                {invoice.customerAccount.name && (
                  <DetailRow label="Name">
                    <span className="text-sm text-foreground">{invoice.customerAccount.name}</span>
                  </DetailRow>
                )}
                {invoice.customerAccount.address && (
                  <DetailRow label="Address">
                    <span className="text-sm text-foreground">{invoice.customerAccount.address}</span>
                  </DetailRow>
                )}
                {(invoice.customerAccount.city || invoice.customerAccount.state || invoice.customerAccount.postalCode) && (
                  <DetailRow label="City / State / Zip">
                    <span className="text-sm text-foreground">
                      {[invoice.customerAccount.city, invoice.customerAccount.state, invoice.customerAccount.postalCode].filter(Boolean).join(', ')}
                    </span>
                  </DetailRow>
                )}
                {invoice.customerAccount.country && (
                  <DetailRow label="Country">
                    <span className="text-sm text-foreground">{invoice.customerAccount.country}</span>
                  </DetailRow>
                )}
              </div>
            </div>
          )}

          {/* Line items */}
          {invoice.items?.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Line Items</h3>
              <div className="bg-muted rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-3.5 py-2 text-left text-xs font-medium text-muted-foreground">Description</th>
                      <th className="px-3.5 py-2 text-right text-xs font-medium text-muted-foreground">Qty</th>
                      <th className="px-3.5 py-2 text-right text-xs font-medium text-muted-foreground">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {invoice.items.map((item: any) => (
                      <tr key={item.id}>
                        <td className="px-3.5 py-2 text-foreground">{item.description}</td>
                        <td className="px-3.5 py-2 text-right text-muted-foreground">{item.quantity ?? 1}</td>
                        <td className="px-3.5 py-2 text-right font-medium text-foreground">{item.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-border">
                    {invoice.taxAmount && Number(invoice.taxAmount) > 0 && (
                      <tr>
                        <td colSpan={2} className="px-3.5 py-1.5 text-right text-xs text-muted-foreground">
                          Subtotal
                        </td>
                        <td className="px-3.5 py-1.5 text-right text-sm text-muted-foreground">
                          {Number(invoice.subtotal).toFixed(2)} {invoice.currency}
                        </td>
                      </tr>
                    )}
                    {invoice.taxAmount && Number(invoice.taxAmount) > 0 && (
                      <tr>
                        <td colSpan={2} className="px-3.5 py-1.5 text-right text-xs text-muted-foreground">
                          {invoice.taxRate?.displayName ?? 'Tax'} ({Number(invoice.taxRate?.percentage ?? 0)}%{invoice.taxRate?.inclusive ? ' incl.' : ''})
                        </td>
                        <td className="px-3.5 py-1.5 text-right text-sm text-muted-foreground">
                          {Number(invoice.taxAmount).toFixed(2)} {invoice.currency}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={2} className="px-3.5 py-2 text-right text-xs font-semibold text-muted-foreground">Total</td>
                      <td className="px-3.5 py-2 text-right font-semibold text-foreground">{Number(invoice.total).toFixed(2)} {invoice.currency}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Memo */}
          {invoice.memo && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Memo</h3>
              <div className="bg-muted rounded-lg p-3.5 text-sm text-secondary-foreground">{invoice.memo}</div>
            </div>
          )}

          {/* Invoice dates */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Timeline</h3>
            <div className="bg-muted rounded-lg p-3.5 space-y-0">
              <DetailRow label="Created">{formatDateTime(invoice.createdAt)}</DetailRow>
              {invoice.dueDate && <DetailRow label="Due Date">{formatDateTime(invoice.dueDate)}</DetailRow>}
              {invoice.paidAt && <DetailRow label="Paid At">{formatDateTime(invoice.paidAt)}</DetailRow>}
              {invoice.voidedAt && <DetailRow label="Voided At">{formatDateTime(invoice.voidedAt)}</DetailRow>}
            </div>
          </div>

          {/* Payment details — only shown when there's a linked paymentIntent */}
          {pi && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Payment Details</h3>
              <div className="bg-muted rounded-lg p-3.5 space-y-0">
                <DetailRow label="Payment Status"><PaymentStatusBadge status={pi.status} /></DetailRow>
                {hasChain && (
                  <DetailRow label="Network">
                    <span className="text-sm text-foreground">{chainDisplayName(chainId)}</span>
                    <span className="text-xs text-muted-foreground/60 ml-1.5">({chainId})</span>
                  </DetailRow>
                )}
                {tokenInfo && (
                  <DetailRow label="Token">
                    <span className="text-sm font-medium text-foreground">{tokenInfo.symbol}</span>
                  </DetailRow>
                )}
                {pi.cryptoAmount && (
                  <DetailRow label="Crypto Amount">
                    <span className="text-sm font-mono text-foreground">
                      {formatCryptoAmount(pi.cryptoAmount, pi.cryptoTokenDecimals)}
                    </span>
                    {tokenInfo && <span className="text-xs text-muted-foreground/60 ml-1">{tokenInfo.symbol}</span>}
                  </DetailRow>
                )}
                {pi.exchangeRate && (
                  <DetailRow label="Exchange Rate">
                    <span className="text-sm font-mono text-foreground">{Number(pi.exchangeRate).toFixed(6)}</span>
                  </DetailRow>
                )}
                {pi.authorizationMethod && (
                  <DetailRow label="Auth Method">
                    <Badge variant="outline">{pi.authorizationMethod.replace('_', ' ')}</Badge>
                  </DetailRow>
                )}
                {pi.authorizationWalletAddress && (
                  <DetailRow label="Payer Wallet">
                    <div className="flex items-center gap-1.5">
                      <CopyField value={pi.authorizationWalletAddress} />
                      {hasChain && blockExplorerAddressUrl(chainId, pi.authorizationWalletAddress) && (
                        <a href={blockExplorerAddressUrl(chainId, pi.authorizationWalletAddress) ?? '#'} target="_blank" rel="noopener noreferrer" className="shrink-0 p-0.5 rounded hover:bg-muted" title="View on explorer">
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </a>
                      )}
                    </div>
                  </DetailRow>
                )}
                {pi.authorizationTxHash && (
                  <DetailRow label="Auth Tx">
                    <div className="flex items-center gap-1.5">
                      <CopyField value={pi.authorizationTxHash} />
                      {hasChain && blockExplorerTxUrl(chainId, pi.authorizationTxHash) && (
                        <a href={blockExplorerTxUrl(chainId, pi.authorizationTxHash) ?? '#'} target="_blank" rel="noopener noreferrer" className="shrink-0 p-0.5 rounded hover:bg-muted" title="View on explorer">
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </a>
                      )}
                    </div>
                  </DetailRow>
                )}
                {pi.captureTxHash && (
                  <DetailRow label="Capture Tx">
                    <div className="flex items-center gap-1.5">
                      <CopyField value={pi.captureTxHash} />
                      {hasChain && blockExplorerTxUrl(chainId, pi.captureTxHash) && (
                        <a href={blockExplorerTxUrl(chainId, pi.captureTxHash) ?? '#'} target="_blank" rel="noopener noreferrer" className="shrink-0 p-0.5 rounded hover:bg-muted" title="View on explorer">
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </a>
                      )}
                    </div>
                  </DetailRow>
                )}
                {pi.authorizedAt && <DetailRow label="Authorized"><span className="text-sm text-foreground">{formatDateTime(pi.authorizedAt)}</span></DetailRow>}
                {pi.capturedAt && <DetailRow label="Captured"><span className="text-sm text-foreground">{formatDateTime(pi.capturedAt)}</span></DetailRow>}
                {pi.settledAt && <DetailRow label="Settled"><span className="text-sm text-foreground">{formatDateTime(pi.settledAt)}</span></DetailRow>}
              </div>
            </div>
          )}

          {/* Transactions */}
          {sortedTxs.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Transactions ({sortedTxs.length})</h3>
              <div className="space-y-2">
                {sortedTxs.map((tx: any) => (
                  <div key={tx.id} className="bg-muted rounded-lg p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{tx.type}</Badge>
                        <TxStatusBadge status={tx.status} />
                      </div>
                      <span className="text-xs text-muted-foreground/60">{formatDateTime(tx.createdAt)}</span>
                    </div>
                    <div className="space-y-1.5">
                      {tx.txHash && (
                        <div className="flex items-center gap-1.5">
                          <CopyField label="Hash" value={tx.txHash} />
                          {(() => {
                            const url = hasChain ? blockExplorerTxUrl(chainId, tx.txHash) : null;
                            return url ? (
                              <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 p-0.5 rounded hover:bg-muted" title="View on explorer">
                                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                              </a>
                            ) : null;
                          })()}
                        </div>
                      )}
                      {tx.mtxmTxId && <CopyField label="MTXM ID" value={tx.mtxmTxId} />}
                      {tx.chain && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground shrink-0">Chain:</span>
                          <span className="text-xs text-foreground">{tx.chain}</span>
                        </div>
                      )}
                      {tx.error && (
                        <div className="mt-1 text-xs text-destructive bg-destructive/10 rounded px-2 py-1">{tx.error}</div>
                      )}
                      {tx.confirmedAt && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">Confirmed:</span>
                          <span className="text-xs text-foreground">{formatDateTime(tx.confirmedAt)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}


        </div>
      </SheetContent>
    </Sheet>
  );
}

interface LineItem {
  description: string;
  amount: string;
  quantity: string;
}

const emptyItem: LineItem = { description: '', amount: '', quantity: '1' };

export default function AppInvoicesPage() {
  const { id: appId } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const sendAfterCreateRef = useRef(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [voidTargetId, setVoidTargetId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [autoOpenDone, setAutoOpenDone] = useState(false);

  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>('existing');
  const [newCustomer, setNewCustomer] = useState({ email: '', name: '' });
  const [formData, setFormData] = useState({
    customerAccountId: '',
    currency: 'USD',
    dueDate: '',
    memo: '',
    taxRateId: '',
  });
  const [items, setItems] = useState<LineItem[]>([{ ...emptyItem }]);
  const [taxRates, setTaxRates] = useState<any[]>([]);
  const [currencies, setCurrencies] = useState<any[]>([]);

  const loadInvoices = useCallback(async () => {
    if (!token) return;
    const params: Record<string, string> = { page: String(page), pageSize: '20', appId };
    if (statusFilter) params.status = statusFilter;
    api.getInvoices(token, params).then(setData).catch(() => {});
  }, [token, page, appId, statusFilter]);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  useEffect(() => {
    if (!token) return;
    api.getCustomers(token, { pageSize: '100', appId }).then((r) => setCustomers(r.items ?? [])).catch(() => {});
    api.getTaxRates(token).then((rates) => setTaxRates(Array.isArray(rates) ? rates : [])).catch(() => {});
    api.getAvailableCurrencies(token).then((c) => setCurrencies(Array.isArray(c) ? c : [])).catch(() => {});
  }, [token, appId]);

  const resetForm = () => {
    setFormData({ customerAccountId: '', currency: 'USD', dueDate: '', memo: '', taxRateId: '' });
    setNewCustomer({ email: '', name: '' });
    setCustomerMode('existing');
    setItems([{ ...emptyItem }]);
    setShowForm(false);
    setError('');
  };

  const addItem = () => setItems([...items, { ...emptyItem }]);
  const removeItem = (idx: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== idx));
  };
  const updateItem = (idx: number, field: keyof LineItem, value: string) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: value };
    setItems(updated);
  };

  const subtotal = items.reduce((sum, item) => {
    const amt = parseFloat(item.amount) || 0;
    const qty = parseInt(item.quantity) || 1;
    return sum + amt * qty;
  }, 0);

  // Compute tax preview
  const selectedTaxRate = taxRates.find((r: any) => r.id === formData.taxRateId);
  const taxPercentage = selectedTaxRate ? Number(selectedTaxRate.percentage) : 0;
  const taxInclusive = selectedTaxRate?.inclusive ?? false;
  const taxAmount = taxPercentage > 0
    ? taxInclusive
      ? Math.round((subtotal - subtotal / (1 + taxPercentage / 100)) * 100) / 100
      : Math.round(subtotal * (taxPercentage / 100) * 100) / 100
    : 0;
  const total = taxInclusive ? subtotal : subtotal + taxAmount;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError('');
    setSubmitting(true);
    try {
      let customerAccountId = formData.customerAccountId;

      // If creating a new customer inline, do that first
      if (customerMode === 'new') {
        if (!newCustomer.email && !newCustomer.name) {
          setError('Please provide at least an email or name for the new customer');
          setSubmitting(false);
          return;
        }
        const created = await api.createCustomer(token, {
          appId,
          email: newCustomer.email || undefined,
          name: newCustomer.name || undefined,
        });
        customerAccountId = created.id;
        // Refresh customer list so new customer appears in dropdown
        api.getCustomers(token, { pageSize: '100', appId }).then((r) => setCustomers(r.items ?? [])).catch(() => {});
      }

      const payload: Record<string, unknown> = {
        appId,
        customerAccountId,
        currency: formData.currency,
        items: items.map((item) => ({
          description: item.description,
          amount: item.amount,
          quantity: parseInt(item.quantity) || 1,
        })),
      };
      if (formData.dueDate) payload.dueDate = new Date(formData.dueDate).toISOString();
      if (formData.memo) payload.memo = formData.memo;
      if (formData.taxRateId) payload.taxRateId = formData.taxRateId;

      const invoice = await api.createInvoice(token, payload);

      // If "Create & Send Email" was clicked, send the invoice email
      if (sendAfterCreateRef.current && invoice?.id) {
        try {
          await api.sendInvoiceEmail(token, invoice.id);
        } catch (sendErr: any) {
          // Invoice was created but email failed — still reset form but show warning
          setError(`Invoice created but email failed: ${sendErr.message ?? 'Unknown error'}`);
        }
      }

      sendAfterCreateRef.current = false;
      resetForm();
      await loadInvoices();
    } catch (err: any) {
      setError(err.message ?? 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (id: string, action: 'open' | 'void') => {
    if (!token) return;
    setVoidTargetId(null);
    setActionLoading(id);
    try {
      if (action === 'open') await api.openInvoice(token, id);
      else await api.voidInvoice(token, id);
      await loadInvoices();
    } catch (err: any) {
      setError(err.message ?? `Failed to ${action} invoice`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendInvoice = async (id: string) => {
    if (!token) return;
    setActionLoading(id);
    setError('');
    try {
      await api.sendInvoiceEmail(token, id);
      await loadInvoices();
    } catch (err: any) {
      setError(err.message ?? 'Failed to send invoice email');
    } finally {
      setActionLoading(null);
    }
  };

  const searchParams = useSearchParams();

  const openDetail = useCallback(async (invoiceId: string) => {
    if (!token) return;
    setLoadingDetail(true);
    try {
      const detail = await api.getInvoice(token, invoiceId);
      setSelectedInvoice(detail);
    } catch {
      // fallback: use list data (won't have deep paymentIntent but still shows basic info)
      const fromList = data?.items?.find((inv: any) => inv.id === invoiceId);
      if (fromList) setSelectedInvoice(fromList);
    } finally {
      setLoadingDetail(false);
    }
  }, [token, data]);

  // Auto-open invoice detail from URL query param (e.g. ?invoiceId=xxx) — only once
  useEffect(() => {
    if (autoOpenDone) return;
    const invoiceId = searchParams.get('invoiceId');
    if (invoiceId && token) {
      setAutoOpenDone(true);
      openDetail(invoiceId);
    }
  }, [searchParams, token, openDetail, autoOpenDone]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create and manage payment invoices for this app</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="h-4 w-4" /> New Invoice
        </Button>
      </div>

      <FilterNav
        options={[
          { value: '', label: 'All' },
          { value: 'DRAFT', label: 'Draft' },
          { value: 'OPEN', label: 'Open' },
          { value: 'PAID', label: 'Paid' },
          { value: 'VOID', label: 'Void' },
          { value: 'UNCOLLECTIBLE', label: 'Uncollectible' },
        ]}
        value={statusFilter}
        onChange={(v) => { setStatusFilter(v); setPage(1); }}
      />

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
      )}

      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">New Invoice</h3>
            <button onClick={resetForm} className="text-muted-foreground/60 hover:text-secondary-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={handleCreate} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Customer: Existing or New */}
              <div className="space-y-1.5 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-[13px] font-medium text-secondary-foreground">Customer</label>
                  <div className="flex rounded-lg border border-border overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setCustomerMode('existing')}
                      className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors ${
                        customerMode === 'existing'
                          ? 'bg-primary text-white'
                          : 'bg-card text-muted-foreground hover:text-secondary-foreground'
                      }`}
                    >
                      <Users className="h-3 w-3" /> Existing
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomerMode('new')}
                      className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors ${
                        customerMode === 'new'
                          ? 'bg-primary text-white'
                          : 'bg-card text-muted-foreground hover:text-secondary-foreground'
                      }`}
                    >
                      <UserPlus className="h-3 w-3" /> New
                    </button>
                  </div>
                </div>

                {customerMode === 'existing' ? (
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
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      placeholder="Email"
                      type="email"
                      value={newCustomer.email}
                      onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                    />
                    <input
                      className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      placeholder="Name (optional)"
                      value={newCustomer.name}
                      onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="text-[13px] font-medium text-secondary-foreground mb-1.5 block">Currency</label>
                <select
                  className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                >
                  {currencies.length > 0 ? (
                    currencies.map((c: any) => (
                      <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
                    ))
                  ) : (
                    <option value="USD">USD ($)</option>
                  )}
                </select>
              </div>
              <Input
                label="Due Date (optional)"
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              />
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-[13px] font-medium text-secondary-foreground">Line Items</label>
                <button type="button" onClick={addItem} className="text-xs font-medium text-primary hover:text-primary/90 transition-colors">
                  + Add item
                </button>
              </div>
              <div className="space-y-3">
                {items.map((item, idx) => (
                  <div key={idx} className="flex gap-3 items-start">
                    <div className="flex-1">
                      <input
                        className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => updateItem(idx, 'description', e.target.value)}
                        required
                      />
                    </div>
                    <div className="w-28">
                      <input
                        className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        placeholder="Amount"
                        value={item.amount}
                        onChange={(e) => updateItem(idx, 'amount', e.target.value)}
                        required
                      />
                    </div>
                    <div className="w-20">
                      <input
                        type="number"
                        min="1"
                        className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      disabled={items.length <= 1}
                      className="mt-2 text-muted-foreground/60 hover:text-destructive disabled:opacity-30 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              {subtotal > 0 && (
                <div className="mt-3 space-y-1 text-right text-sm">
                  <div className="text-muted-foreground">
                    Subtotal: {subtotal.toFixed(2)} {formData.currency}
                  </div>
                  {taxAmount > 0 && (
                    <div className="text-muted-foreground">
                      {selectedTaxRate?.displayName ?? 'Tax'} ({taxPercentage}%{taxInclusive ? ' incl.' : ''}): {taxAmount.toFixed(2)} {formData.currency}
                    </div>
                  )}
                  <div className="font-medium text-foreground">
                    Total: {total.toFixed(2)} {formData.currency}
                  </div>
                </div>
              )}
            </div>

            {/* Tax Rate */}
            <div>
              <label className="text-[13px] font-medium text-secondary-foreground block mb-1.5">Tax Rate (optional)</label>
              <select
                className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                value={formData.taxRateId}
                onChange={(e) => setFormData({ ...formData, taxRateId: e.target.value })}
              >
                <option value="">No tax</option>
                {taxRates.map((rate: any) => (
                  <option key={rate.id} value={rate.id}>
                    {rate.displayName} ({Number(rate.percentage)}%{rate.inclusive ? ', inclusive' : ''})
                    {rate.jurisdiction ? ` · ${rate.jurisdiction}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <Textarea
              label="Memo (optional)"
              placeholder="Notes or payment instructions for the customer..."
              value={formData.memo}
              onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
              rows={2}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={resetForm}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting && !sendAfterCreateRef.current ? 'Creating...' : 'Create Invoice'}
              </Button>
              <Button
                type="button"
                disabled={submitting}
                onClick={() => {
                  sendAfterCreateRef.current = true;
                  // Trigger form submit programmatically
                  const form = document.querySelector<HTMLFormElement>('form');
                  if (form) form.requestSubmit();
                }}
              >
                {submitting && sendAfterCreateRef.current ? (
                  <>Sending...</>
                ) : (
                  <><Send className="h-4 w-4 mr-1" /> Create & Send Email</>
                )}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {!data ? (
        <Spinner />
      ) : data.items?.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="Create invoices to request crypto payments from your customers"
          icon={FileText}
          action={<Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> New Invoice</Button>}
        />
      ) : (
        <>
          <Table headers={['Invoice #', 'Total', 'Customer', 'Items', 'Status', 'Due', 'Actions']}>
            {data.items.map((inv: any) => (
              <tr key={inv.id} className="hover:bg-muted transition-colors cursor-pointer" onClick={() => openDetail(inv.id)} title="Click to view details">
                <td className="px-4 py-3.5">
                  <div>
                    <span className="font-mono text-xs text-secondary-foreground">{inv.invoiceNumber ?? ''}</span>
                    <div className="mt-0.5"><CopyableId value={inv.id} chars={6} /></div>
                  </div>
                </td>
                <td className="px-4 py-3.5 font-medium text-foreground">
                  {inv.total ? `${inv.total} ${inv.currency ?? ''}`.trim() : '—'}
                </td>
                <td className="px-4 py-3.5 text-xs text-muted-foreground">
                  {inv.customerAccount?.email ?? inv.customerAccount?.name ?? '—'}
                </td>
                <td className="px-4 py-3.5 text-muted-foreground text-sm">{inv.items?.length ?? 0}</td>
                <td className="px-4 py-3.5">{statusBadge(inv.status)}</td>
                <td className="px-4 py-3.5 text-muted-foreground text-xs">
                  {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {inv.status === 'DRAFT' && (
                      <button
                        onClick={() => handleSendInvoice(inv.id)}
                        disabled={actionLoading === inv.id}
                        title="Send invoice email"
                        className="rounded-md p-1.5 text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {inv.status === 'OPEN' && (
                      <button
                        onClick={() => {
                          const paymentUiBase = process.env.NEXT_PUBLIC_PAYMENT_UI_URL ?? 'http://localhost:3002';
                          const url = `${paymentUiBase}/invoice/${inv.id}`;
                          navigator.clipboard.writeText(url);
                          setCopiedId(inv.id);
                          setTimeout(() => setCopiedId(null), 2000);
                        }}
                        title={copiedId === inv.id ? 'Copied!' : 'Copy payment link'}
                        className="rounded-md p-1.5 text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors"
                      >
                        {copiedId === inv.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Link2 className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    {(inv.status === 'DRAFT' || inv.status === 'OPEN') && (
                      <button
                        onClick={() => setVoidTargetId(inv.id)}
                        disabled={actionLoading === inv.id}
                        title="Void"
                        className="rounded-md p-1.5 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Ban className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {actionLoading === inv.id && (
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

      {/* Detail drawer */}
      {selectedInvoice && (
        <InvoiceDetailPanel
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
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

      <ConfirmDialog
        open={!!voidTargetId}
        onOpenChange={(open) => !open && setVoidTargetId(null)}
        title="Void Invoice"
        description="Void this invoice? This cannot be undone."
        confirmLabel="Void"
        onConfirm={() => voidTargetId && handleAction(voidTargetId, 'void')}
      />
    </div>
  );
}

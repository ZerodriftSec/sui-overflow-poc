'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { Badge, Table, Button, Input, Card, Spinner, EmptyState } from '@/components/ui';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { FilterNav, CopyableId } from '@/components/filter-nav';
import { Users, Plus, X, Copy, Check, MapPin, CreditCard, FileText, ExternalLink } from 'lucide-react';
import { formatCryptoAmount, parseTokenKey, chainDisplayName } from '@noderails/common';

export default function AppCustomersPage() {
  const { id: appId } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ externalId: '', email: '', name: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadCustomers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params: Record<string, string> = { page: String(page), pageSize: '20', appId };
    if (searchQuery) params.search = searchQuery;
    api.getCustomers(token, params)
      .then((result) => {
        setCustomers(result.items ?? []);
        setTotal(result.total ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, page, appId, searchQuery]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const openDetail = useCallback(async (customerId: string) => {
    if (!token) return;
    setLoadingDetail(true);
    try {
      const detail = await api.getCustomer(token, customerId);
      setSelectedCustomer(detail);
    } catch {
      const fromList = customers.find((c: any) => c.id === customerId);
      if (fromList) setSelectedCustomer(fromList);
    } finally {
      setLoadingDetail(false);
    }
  }, [token, customers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError('');
    setSubmitting(true);
    try {
      await api.createCustomer(token, {
        appId,
        externalId: formData.externalId || undefined,
        email: formData.email || undefined,
        name: formData.name || undefined,
      });
      setShowForm(false);
      setFormData({ externalId: '', email: '', name: '' });
      setPage(1);
      await loadCustomers();
    } catch (err: any) {
      setError(err.message ?? 'Failed to create customer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage customer accounts ({total})</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4" /> Add Customer
        </Button>
      </div>

      <FilterNav
        options={[{ value: '', label: 'All' }]}
        value=""
        onChange={() => {}}
        search={{
          value: searchQuery,
          onChange: (v) => { setSearchQuery(v); setPage(1); },
          placeholder: 'Search by name, email, or external ID...',
        }}
      />

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
      )}

      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">New Customer</h3>
            <button onClick={() => setShowForm(false)} className="text-muted-foreground/60 hover:text-secondary-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
            <Input
              label="External ID"
              placeholder="your-user-123"
              value={formData.externalId}
              onChange={(e) => setFormData({ ...formData, externalId: e.target.value })}
            />
            <Input
              label="Email"
              type="email"
              placeholder="customer@example.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
            <Input
              label="Name"
              placeholder="John Doe"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Customer'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <Spinner />
      ) : customers.length === 0 ? (
        <EmptyState
          title="No customers"
          description="Create customer accounts to track payments and subscriptions"
          icon={Users}
          action={<Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Add Customer</Button>}
        />
      ) : (
        <>
          <Table headers={['Name', 'Email', 'External ID', 'Payments', 'Invoices', 'Created']}>
            {customers.map((c: any) => (
              <tr
                key={c.id}
                className="hover:bg-muted transition-colors cursor-pointer"
                onClick={() => openDetail(c.id)}
                title="Click to view details"
              >
                <td className="px-4 py-3 text-sm font-medium text-foreground">{c.name ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-secondary-foreground">{c.email ?? '—'}</td>
                <td className="px-4 py-3"><CopyableId value={c.externalId ?? c.id} chars={6} /></td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{c._count?.paymentIntents ?? 0}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{c._count?.invoices ?? 0}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {new Date(c.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </Table>

          {total > 20 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg px-3 py-1.5 text-sm text-secondary-foreground hover:bg-muted disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-muted-foreground">Page {page} of {Math.ceil(total / 20)}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= Math.ceil(total / 20)}
                className="rounded-lg px-3 py-1.5 text-sm text-secondary-foreground hover:bg-muted disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Detail drawer */}
      {selectedCustomer && (
        <CustomerDetailDrawer
          customer={selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
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

// ── Helpers ──

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

function formatDateTime(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const piStatusVariant: Record<string, 'success' | 'warning' | 'destructive' | 'outline' | 'default'> = {
  CREATED: 'outline', AUTHORIZED: 'default', CAPTURING: 'warning', CAPTURED: 'success',
  SETTLED: 'success', CAPTURE_FAILED: 'destructive', CANCELLED: 'outline', EXPIRED: 'outline',
  DISPUTED: 'destructive', REFUNDED: 'destructive',
};

const invStatusVariant: Record<string, 'success' | 'warning' | 'destructive' | 'outline' | 'default'> = {
  DRAFT: 'outline', OPEN: 'default', PAID: 'success', VOID: 'outline',
  PAST_DUE: 'warning', UNCOLLECTIBLE: 'destructive',
};

// ── Customer Detail Drawer ──

function CustomerDetailDrawer({ customer, onClose }: { customer: any; onClose: () => void }) {
  const payments = customer.paymentIntents ?? [];
  const invoices = customer.invoices ?? [];
  const hasAddress = customer.address || customer.city || customer.state || customer.country || customer.postalCode;

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="sm:max-w-lg p-0 overflow-y-auto" showCloseButton={false}>
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {customer.name || customer.email || 'Customer'}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Created {formatDateTime(customer.createdAt)}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Contact Info */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Contact</h3>
            <div className="bg-muted rounded-lg p-3.5 space-y-0">
              {customer.email && (
                <DetailRow label="Email"><CopyField value={customer.email} mono={false} /></DetailRow>
              )}
              {customer.name && (
                <DetailRow label="Name">
                  <span className="text-sm text-foreground">{customer.name}</span>
                </DetailRow>
              )}
              {customer.externalId && (
                <DetailRow label="External ID"><CopyField value={customer.externalId} /></DetailRow>
              )}
              <DetailRow label="Customer ID"><CopyField value={customer.id} /></DetailRow>
            </div>
          </div>

          {/* Billing Address */}
          {hasAddress && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                <MapPin className="h-3 w-3 inline mr-1" />
                Billing Address
              </h3>
              <div className="bg-muted rounded-lg p-3.5 space-y-0">
                {customer.address && (
                  <DetailRow label="Address">
                    <span className="text-sm text-foreground">{customer.address}</span>
                  </DetailRow>
                )}
                {(customer.city || customer.state || customer.postalCode) && (
                  <DetailRow label="City / State / Zip">
                    <span className="text-sm text-foreground">
                      {[customer.city, customer.state, customer.postalCode].filter(Boolean).join(', ')}
                    </span>
                  </DetailRow>
                )}
                {customer.country && (
                  <DetailRow label="Country">
                    <span className="text-sm text-foreground">{customer.country}</span>
                  </DetailRow>
                )}
              </div>
            </div>
          )}

          {/* Wallets */}
          {customer.wallets?.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Wallets ({customer.wallets.length})
              </h3>
              <div className="space-y-2">
                {customer.wallets.map((w: any) => (
                  <div key={w.id} className="bg-muted rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <CopyField value={w.walletAddress} />
                      {w.chain && (
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">{w.chain.name ?? `Chain ${w.chain.chainId}`}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payments */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              <CreditCard className="h-3 w-3 inline mr-1" />
              Payments ({payments.length})
            </h3>
            {payments.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 italic">No payments yet</p>
            ) : (
              <div className="space-y-2">
                {payments.map((p: any) => {
                  const tokenInfo = parseTokenKey(p.cryptoTokenKey);
                  const chainName = p.authorizationChainId != null ? chainDisplayName(p.authorizationChainId) : null;
                  const sourceType = p.sourceType ?? p.checkoutSessions?.[0]?.sourceType;
                  return (
                    <div key={p.id} className="bg-muted rounded-lg p-3.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-foreground">
                            {p.amount ? `$${Number(p.amount).toFixed(2)}` : '—'}
                          </span>
                          <Badge variant={piStatusVariant[p.status] ?? 'outline'}>{p.status}</Badge>
                        </div>
                        <span className="text-[10px] text-muted-foreground/60">{formatDate(p.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {tokenInfo && p.cryptoAmount && (
                          <span>{formatCryptoAmount(p.cryptoAmount, p.cryptoTokenDecimals)} {tokenInfo.symbol}</span>
                        )}
                        {chainName && <span>{chainName}</span>}
                        {sourceType && <Badge variant="outline">{sourceType.replace('_', ' ')}</Badge>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Invoices */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              <FileText className="h-3 w-3 inline mr-1" />
              Invoices ({invoices.length})
            </h3>
            {invoices.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 italic">No invoices yet</p>
            ) : (
              <div className="space-y-2">
                {invoices.map((inv: any) => (
                  <div key={inv.id} className="bg-muted rounded-lg p-3.5">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-foreground">{inv.invoiceNumber}</span>
                        <Badge variant={invStatusVariant[inv.status] ?? 'outline'}>{inv.status}</Badge>
                      </div>
                      <span className="font-medium text-sm text-foreground">
                        {inv.total ? `$${Number(inv.total).toFixed(2)}` : '—'} {inv.currency}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {inv.dueDate && <span>Due: {formatDate(inv.dueDate)}</span>}
                      {inv.paidAt && <span>Paid: {formatDate(inv.paidAt)}</span>}
                      <span>Created: {formatDate(inv.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Metadata */}
          {customer.metadata && Object.keys(customer.metadata).length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Metadata</h3>
              <div className="bg-muted rounded-lg p-3.5">
                <pre className="text-xs text-secondary-foreground font-mono whitespace-pre-wrap break-all">
                  {JSON.stringify(customer.metadata, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

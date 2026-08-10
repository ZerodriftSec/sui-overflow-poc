'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { Badge, Table, Button, Card, Input, Textarea, Select, Spinner, EmptyState, Toggle } from '@/components/ui';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FilterNav, CopyableId } from '@/components/filter-nav';
import { LinkIcon, Plus, X, Pencil, Trash2, Copy, Check, ExternalLink, AlertTriangle } from 'lucide-react';

export default function AppPaymentLinksPage() {
  const { id: appId } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Chain/token data for the picker
  const [appChains, setAppChains] = useState<any[]>([]);
  const [appTokens, setAppTokens] = useState<any[]>([]);
  const [chainsLoading, setChainsLoading] = useState(false);

  // Chain/token selection state
  const [allChains, setAllChains] = useState(true);
  const [selectedChainIds, setSelectedChainIds] = useState<number[]>([]);
  const [allTokens, setAllTokens] = useState(true);
  const [selectedTokenKeys, setSelectedTokenKeys] = useState<string[]>([]);

  // Product plan + price selection state
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selectedPriceId, setSelectedPriceId] = useState('');
  const [plansLoading, setPlansLoading] = useState(false);
  const [requireBillingDetails, setRequireBillingDetails] = useState(false);

  // Tax rate selection state
  const [taxRates, setTaxRates] = useState<any[]>([]);
  const [selectedTaxRateId, setSelectedTaxRateId] = useState('');

  // Supported currencies
  const [currencies, setCurrencies] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    slug: '',
    amount: '',
    currency: 'USD',
    successUrl: '',
    cancelUrl: '',
  });

  const loadLinks = useCallback(async () => {
    if (!token) return;
    const params: Record<string, string> = { page: String(page), pageSize: '20', appId };
    if (activeFilter) params.isActive = activeFilter;
    api.getPaymentLinks(token, params).then(setData).catch(() => {});
  }, [token, page, appId, activeFilter]);

  useEffect(() => { loadLinks(); }, [loadLinks]);

  // Preload dropdown data (plans, currencies, tax rates, chains, tokens) on mount
  const loadChainTokenData = useCallback(async () => {
    if (!token) return;
    setChainsLoading(true);
    setPlansLoading(true);
    // Load each data source independently so one failure doesn't block the rest
    api.getAppChains(token, appId)
      .then((chains) => setAppChains((Array.isArray(chains) ? chains : []).filter((c: any) => c.isEnabled)))
      .catch(() => {})
      .finally(() => setChainsLoading(false));
    api.getAppTokens(token, appId)
      .then((tokens) => setAppTokens((Array.isArray(tokens) ? tokens : []).filter((t: any) => t.isEnabled)))
      .catch(() => {});
    api.getProductPlans(token, { appId, pageSize: '100' })
      .then((result) => {
        const allPlans = result.items ?? [];
        setPlans(allPlans.filter((p: any) => p.isActive));
      })
      .catch(() => {})
      .finally(() => setPlansLoading(false));
    api.getTaxRates(token)
      .then((rates) => setTaxRates((Array.isArray(rates) ? rates : []).filter((r: any) => r.isActive)))
      .catch(() => {});
    api.getAvailableCurrencies(token)
      .then((c) => setCurrencies(Array.isArray(c) ? c : []))
      .catch(() => {});
  }, [token, appId]);

  useEffect(() => { loadChainTokenData(); }, [loadChainTokenData]);

  // When chain selection changes, remove tokens that are no longer on selected chains
  useEffect(() => {
    if (allChains || allTokens) return;
    setSelectedTokenKeys((prev) => {
      const validKeys = prev.filter((tk) => {
        const at = appTokens.find((t: any) => t.supportedToken.tokenKey === tk);
        return at && selectedChainIds.includes(at.supportedToken.chainId);
      });
      return validKeys.length === prev.length ? prev : validKeys;
    });
  }, [selectedChainIds, allChains, allTokens, appTokens]);

  const resetForm = () => {
    setFormData({ name: '', description: '', slug: '', amount: '', currency: 'USD', successUrl: '', cancelUrl: '' });
    setAllChains(true);
    setSelectedChainIds([]);
    setAllTokens(true);
    setSelectedTokenKeys([]);
    setSelectedPlanId('');
    setSelectedPriceId('');
    setRequireBillingDetails(false);
    setSelectedTaxRateId('');
    setShowForm(false);
    setEditingId(null);
    setError('');
  };

  const handleNameChange = (name: string) => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 100);
    setFormData((prev) => ({
      ...prev,
      name,
      ...(editingId ? {} : { slug }),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError('');
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: formData.name,
        currency: formData.currency || 'USD',
      };
      if (formData.description) payload.description = formData.description;
      if (formData.amount) payload.amount = formData.amount;
      if (formData.successUrl) payload.successUrl = formData.successUrl;
      if (formData.cancelUrl) payload.cancelUrl = formData.cancelUrl;

      // Product plan + price
      if (selectedPlanId) {
        payload.productPlanId = selectedPlanId;
        if (selectedPriceId) payload.productPlanPriceId = selectedPriceId;
      } else if (editingId) {
        // Clearing plan on edit
        payload.productPlanId = null;
        payload.productPlanPriceId = null;
      }

      // Chain/token selection
      payload.allowedChains = allChains ? 'ALL' : selectedChainIds;
      payload.allowedTokens = allTokens ? 'ALL' : selectedTokenKeys;
      payload.requireBillingDetails = requireBillingDetails;

      // Tax rate
      if (selectedTaxRateId) {
        payload.taxRateId = selectedTaxRateId;
      } else if (editingId) {
        payload.taxRateId = null;
      }

      if (!allChains && selectedChainIds.length === 0) {
        setError('Select at least one network or enable "All Networks"');
        setSubmitting(false);
        return;
      }
      if (!allTokens && selectedTokenKeys.length === 0) {
        setError('Select at least one token or enable "All Tokens"');
        setSubmitting(false);
        return;
      }

      if (editingId) {
        await api.updatePaymentLink(token, editingId, payload);
      } else {
        payload.appId = appId;
        payload.slug = formData.slug;
        await api.createPaymentLink(token, payload);
      }
      resetForm();
      await loadLinks();
    } catch (err: any) {
      setError(err.message ?? 'Failed to save payment link');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (link: any) => {
    setFormData({
      name: link.name,
      description: link.description ?? '',
      slug: link.slug,
      amount: link.amount ?? '',
      currency: link.currency ?? 'USD',
      successUrl: link.successUrl ?? '',
      cancelUrl: link.cancelUrl ?? '',
    });
    // Pre-populate plan/price
    setSelectedPlanId(link.productPlanId ?? '');
    setSelectedPriceId(link.productPlanPriceId ?? '');
    setRequireBillingDetails(link.requireBillingDetails ?? false);
    setSelectedTaxRateId(link.taxRateId ?? link.taxRate?.id ?? '');
    // Pre-populate chain/token selections
    if (link.allowedChains === 'ALL' || !Array.isArray(link.allowedChains)) {
      setAllChains(true);
      setSelectedChainIds([]);
    } else {
      setAllChains(false);
      setSelectedChainIds(link.allowedChains);
    }
    if (link.allowedTokens === 'ALL' || !Array.isArray(link.allowedTokens)) {
      setAllTokens(true);
      setSelectedTokenKeys([]);
    } else {
      setAllTokens(false);
      setSelectedTokenKeys(link.allowedTokens);
    }
    setEditingId(link.id);
    setShowForm(true);
    loadChainTokenData();
  };

  const handleDelete = async (id: string) => {
    if (!token) return;
    try {
      await api.deletePaymentLink(token, id);
      await loadLinks();
    } catch (err: any) {
      setError(err.message ?? 'Failed to delete payment link');
    }
    setDeleteTarget(null);
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    if (!token) return;
    try {
      await api.updatePaymentLink(token, id, { isActive: !currentActive });
      await loadLinks();
    } catch (err: any) {
      setError(err.message ?? 'Failed to update payment link');
    }
  };

  const copyLink = (link: any, id: string) => {
    const url = link.paymentUrl ?? `${window.location.origin}/link/${link.slug}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payment Links</h1>
          <p className="mt-1 text-sm text-muted-foreground">Shareable URLs for accepting crypto payments</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); loadChainTokenData(); }}>
          <Plus className="h-4 w-4" /> New Link
        </Button>
      </div>

      <FilterNav
        options={[
          { value: '', label: 'All' },
          { value: 'true', label: 'Active' },
          { value: 'false', label: 'Inactive' },
        ]}
        value={activeFilter}
        onChange={(v) => { setActiveFilter(v); setPage(1); }}
      />

      {!chainsLoading && appChains.length === 0 && (
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 p-4">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">No chains or tokens enabled</p>
            <p className="text-sm text-amber-700 mt-0.5">
              This app has no enabled chains. Payment links will not work until you enable at least one chain and token in the{' '}
              <Link prefetch href={`/dashboard/apps/${appId}/settings?tab=chains`} className="underline font-medium hover:text-amber-900">Chains</Link>{' & '}
              <Link prefetch href={`/dashboard/apps/${appId}/settings?tab=tokens`} className="underline font-medium hover:text-amber-900">Tokens</Link>{' '}
              settings.
            </p>
          </div>
        </div>
      )}

      {!chainsLoading && appChains.length > 0 && appTokens.length === 0 && (
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 p-4">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">No tokens enabled</p>
            <p className="text-sm text-amber-700 mt-0.5">
              This app has chains enabled but no tokens. Payment links will not work until you enable at least one token in{' '}
              <Link prefetch href={`/dashboard/apps/${appId}/settings?tab=tokens`} className="underline font-medium hover:text-amber-900">Tokens</Link>{' '}
              settings.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
      )}

      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">{editingId ? 'Edit Payment Link' : 'New Payment Link'}</h3>
            <button onClick={resetForm} className="text-muted-foreground/60 hover:text-secondary-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Name"
              placeholder="Pro Plan Payment"
              value={formData.name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
            />
            {!editingId && (
              <div className="space-y-1.5">
                <Input
                  label="URL Slug"
                  placeholder="pro-plan"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                  required
                />
                <p className="text-xs text-muted-foreground/60">
                  URL: /link/<span className="text-primary">{formData.slug || '...'}</span>
                </p>
              </div>
            )}
            {/* ── Product Plan + Price ── */}
            <Select
              label="Product Plan (optional)"
              options={[
                { value: '', label: 'No plan (free-form amount)' },
                ...plans.map((p: any) => ({
                  value: p.id,
                  label: `${p.name} (${p.planType === 'SUBSCRIPTION' ? 'Subscription' : 'One-time'})`,
                })),
              ]}
              value={selectedPlanId}
              onChange={(e) => {
                const planId = e.target.value;
                setSelectedPlanId(planId);
                setSelectedPriceId('');
                if (!planId) {
                  // Cleared plan — re-enable amount editing
                  setFormData((prev) => ({ ...prev, amount: '', currency: 'USD' }));
                  setSelectedTaxRateId('');
                } else {
                  // Auto-inherit tax rate from the selected product plan
                  const plan = plans.find((p: any) => p.id === planId);
                  if (plan?.taxRate?.id) {
                    setSelectedTaxRateId(plan.taxRate.id);
                  }
                }
              }}
              disabled={plansLoading}
            />
            {selectedPlanId && (() => {
              const plan = plans.find((p: any) => p.id === selectedPlanId);
              const activePrices = (plan?.prices ?? []).filter((p: any) => p.isActive);
              return (
                <Select
                  label="Price"
                  options={[
                    { value: '', label: 'Select a price...' },
                    ...activePrices.map((pr: any) => ({
                      value: pr.id,
                      label: `${pr.amount} ${pr.currency}${pr.billingInterval ? ` / ${pr.billingInterval.toLowerCase()}` : ''}${pr.nickname ? ` - ${pr.nickname}` : ''}`,
                    })),
                  ]}
                  value={selectedPriceId}
                  onChange={(e) => {
                    const priceId = e.target.value;
                    setSelectedPriceId(priceId);
                    if (priceId) {
                      const price = activePrices.find((p: any) => p.id === priceId);
                      if (price) {
                        setFormData((prev) => ({ ...prev, amount: String(price.amount), currency: price.currency }));
                      }
                    } else {
                      setFormData((prev) => ({ ...prev, amount: '', currency: 'USD' }));
                    }
                  }}
                />
              );
            })()}

            <Input
              label="Amount (optional)"
              placeholder={selectedPriceId ? 'Auto-filled from price' : '29.99 (leave empty for any amount)'}
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              disabled={!!selectedPriceId}
            />
            <Select
              label="Currency"
              options={[
                ...currencies.map((c: any) => ({ value: c.code, label: `${c.code} (${c.symbol})` })),
                ...(currencies.length === 0 ? [{ value: 'USD', label: 'USD ($)' }] : []),
              ]}
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              disabled={!!selectedPriceId}
            />
            <Textarea
              label="Description (optional)"
              placeholder="What they're paying for..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
              className="sm:col-span-2"
            />
            <Input
              label="Success URL (optional)"
              placeholder="https://mysite.com/thanks"
              value={formData.successUrl}
              onChange={(e) => setFormData({ ...formData, successUrl: e.target.value })}
            />
            <Input
              label="Cancel URL (optional)"
              placeholder="https://mysite.com/cancelled"
              value={formData.cancelUrl}
              onChange={(e) => setFormData({ ...formData, cancelUrl: e.target.value })}
            />

            {/* ── Tax Rate ── */}
            <Select
              label={(() => {
                if (!selectedPlanId || !selectedTaxRateId) return 'Tax Rate (optional)';
                const plan = plans.find((p: any) => p.id === selectedPlanId);
                if (plan?.taxRate?.id === selectedTaxRateId) return 'Tax Rate (from product plan)';
                return 'Tax Rate (overridden)';
              })()}
              options={[
                { value: '', label: 'No tax' },
                ...taxRates.map((r: any) => ({
                  value: r.id,
                  label: `${r.displayName} - ${r.percentage}% ${r.inclusive ? '(inclusive)' : '(exclusive)'}${r.jurisdiction ? ` · ${r.jurisdiction}` : ''}`,
                })),
              ]}
              value={selectedTaxRateId}
              onChange={(e) => setSelectedTaxRateId(e.target.value)}
            />

            {/* ── Require Billing Details ── */}
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between rounded-xl border border-border bg-muted px-4 py-3">
                <div>
                  <label className="text-sm font-medium text-foreground">Require Billing Details</label>
                  <p className="text-xs text-muted-foreground mt-0.5">Collect name, address, city, state, country, and postal code at checkout</p>
                </div>
                <Toggle checked={requireBillingDetails} onChange={setRequireBillingDetails} />
              </div>
            </div>

            {/* ── Accepted Networks ── */}
            <div className="sm:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Accepted Networks</label>
                <Toggle checked={allChains} onChange={(v) => { setAllChains(v); if (v) setSelectedChainIds([]); }} label="All Networks" />
              </div>
              {!allChains && (
                chainsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" /> Loading...
                  </div>
                ) : appChains.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No enabled chains. Enable chains in app settings first.</p>
                ) : (
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {appChains.map((ac: any) => {
                      const chain = ac.chain;
                      const checked = selectedChainIds.includes(chain.chainId);
                      return (
                        <label
                          key={chain.chainId}
                          className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 cursor-pointer hover:border-primary/30 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedChainIds((prev) =>
                                checked ? prev.filter((id) => id !== chain.chainId) : [...prev, chain.chainId],
                              );
                            }}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                          />
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="flex h-6 w-6 items-center justify-center rounded bg-muted text-[10px] font-bold text-secondary-foreground shrink-0">
                              {chain.chainId}
                            </div>
                            <span className="text-sm text-foreground truncate">{chain.displayName || chain.name}</span>
                            {chain.isTestnet && <Badge variant="outline">Testnet</Badge>}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )
              )}
            </div>

            {/* ── Accepted Tokens ── */}
            <div className="sm:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Accepted Tokens</label>
                <Toggle checked={allTokens} onChange={(v) => { setAllTokens(v); if (v) setSelectedTokenKeys([]); }} label="All Tokens" />
              </div>
              {!allTokens && (
                chainsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" /> Loading...
                  </div>
                ) : (() => {
                  // Filter tokens to only show those on accepted chains
                  const acceptedChainIds = allChains
                    ? appChains.map((ac: any) => ac.chain.chainId)
                    : selectedChainIds;
                  const filteredTokens = appTokens.filter((at: any) =>
                    acceptedChainIds.includes(at.supportedToken.chainId),
                  );
                  // Group by chain
                  const grouped = new Map<number, { chainName: string; tokens: any[] }>();
                  for (const at of filteredTokens) {
                    const chainId = at.supportedToken.chainId;
                    const chainName = at.supportedToken.chain?.displayName || at.supportedToken.chain?.name || `Chain ${chainId}`;
                    if (!grouped.has(chainId)) grouped.set(chainId, { chainName, tokens: [] });
                    grouped.get(chainId)!.tokens.push(at);
                  }

                  if (grouped.size === 0) {
                    return <p className="text-xs text-muted-foreground">No enabled tokens for the selected networks.</p>;
                  }

                  return (
                    <div className="space-y-3">
                      {Array.from(grouped.entries()).map(([chainId, { chainName, tokens }]) => (
                        <div key={chainId} className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{chainName}</p>
                          <div className="grid gap-1.5 sm:grid-cols-2">
                            {tokens.map((at: any) => {
                              const tk = at.supportedToken.tokenKey;
                              const checked = selectedTokenKeys.includes(tk);
                              return (
                                <label
                                  key={tk}
                                  className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 cursor-pointer hover:border-primary/30 transition-colors"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setSelectedTokenKeys((prev) =>
                                        checked ? prev.filter((k) => k !== tk) : [...prev, tk],
                                      );
                                    }}
                                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                  />
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-sm font-medium text-foreground">{at.supportedToken.symbol}</span>
                                    <span className="text-xs text-muted-foreground truncate">{at.supportedToken.name}</span>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()
              )}
            </div>

            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={resetForm}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : editingId ? 'Update Link' : 'Create Link'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {!data ? (
        <Spinner />
      ) : data.items?.length === 0 ? (
        <EmptyState
          title="No payment links"
          description="Create shareable URLs for accepting crypto payments, no code required"
          icon={LinkIcon}
          action={<Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> New Link</Button>}
        />
      ) : (
        <>
          <Table headers={['Name', 'Link URL', 'Product', 'Amount', 'Tax', 'Networks', 'Uses', 'Status', 'Actions']}>
            {data.items.map((link: any) => {
              const fullUrl = link.paymentUrl ?? `${typeof window !== 'undefined' ? window.location.origin : ''}/link/${link.slug}`;
              return (
              <tr key={link.id} className="hover:bg-muted transition-colors">
                <td className="px-4 py-3.5">
                  <div>
                    <p className="text-sm font-medium text-foreground">{link.name}</p>
                    {link.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{link.description}</p>}
                    <div className="mt-0.5"><CopyableId value={link.id} chars={6} /></div>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-1.5 max-w-[240px]">
                    <code className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-md truncate">{fullUrl}</code>
                    <button
                      onClick={() => copyLink(link, link.id)}
                      title="Copy link"
                      className="text-muted-foreground/60 hover:text-primary transition-colors shrink-0"
                    >
                      {copiedId === link.id ? <Check className="h-3.5 w-3.5 text-emerald-700" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <a
                      href={fullUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground/60 hover:text-primary transition-colors shrink-0"
                      title="Open link"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  {link.productPlan ? (
                    <div>
                      <p className="text-sm text-foreground">{link.productPlan.name}</p>
                      {link.productPlanPrice && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {link.productPlanPrice.amount} {link.productPlanPrice.currency}
                          {link.productPlanPrice.billingInterval && ` / ${link.productPlanPrice.billingInterval.toLowerCase()}`}
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground/60 italic">None</span>
                  )}
                </td>
                <td className="px-4 py-3.5 text-sm text-foreground">
                  {link.amount ? `${link.amount} ${link.currency}` : <span className="text-muted-foreground/60">Any</span>}
                </td>
                <td className="px-4 py-3.5 text-sm">
                  {link.taxRate ? (
                    <span className="text-foreground">
                      {link.taxRate.displayName} ({link.taxRate.percentage}%{link.taxRate.inclusive ? ', incl.' : ''})
                    </span>
                  ) : (
                    <span className="text-muted-foreground/60">-</span>
                  )}
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex flex-wrap gap-1">
                    {link.allowedChains === 'ALL' ? (
                      <Badge variant="outline">All Networks</Badge>
                    ) : Array.isArray(link.allowedChains) ? (
                      link.allowedChains.slice(0, 3).map((cid: number) => (
                        <Badge key={cid} variant="default">{cid}</Badge>
                      ))
                    ) : (
                      <Badge variant="outline">All Networks</Badge>
                    )}
                    {Array.isArray(link.allowedChains) && link.allowedChains.length > 3 && (
                      <Badge variant="outline">+{link.allowedChains.length - 3}</Badge>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3.5 text-sm text-muted-foreground">{link.usageCount}</td>
                <td className="px-4 py-3.5">
                  <button onClick={() => handleToggleActive(link.id, link.isActive)}>
                    <Badge variant={link.isActive ? 'success' : 'outline'}>
                      {link.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </button>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => startEdit(link)}
                      title="Edit"
                      className="rounded-md p-1.5 text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget({ id: link.id, name: link.name })}
                      title="Delete"
                      className="rounded-md p-1.5 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
              );
            })}
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

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Payment Link"
        description={`Delete payment link "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
      />
    </div>
  );
}
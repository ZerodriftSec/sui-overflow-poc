'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { Table, Badge, Button, Input, Card, Select, Spinner, EmptyState } from '@/components/ui';
import { CopyableId } from '@/components/filter-nav';
import { Package, Plus, X, Trash2, ImageIcon } from 'lucide-react';

interface PriceEntry {
  amount: string;
  currency: string;
  billingInterval: string;
  nickname: string;
  isDefault: boolean;
}

const emptyPrice = (planType: string): PriceEntry => ({
  amount: '',
  currency: 'USD',
  billingInterval: planType === 'SUBSCRIPTION' ? 'MONTH' : '',
  nickname: '',
  isDefault: true,
});

export default function AppProductPlansPage() {
  const { id: appId } = useParams<{ id: string }>();
  const { token } = useAuth();
  const router = useRouter();
  const [plans, setPlans] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [planName, setPlanName] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [planImageUrl, setPlanImageUrl] = useState('');
  const [planType, setPlanType] = useState('ONE_TIME');
  const [planTaxRateId, setPlanTaxRateId] = useState('');
  const [prices, setPrices] = useState<PriceEntry[]>([emptyPrice('ONE_TIME')]);
  const [taxRates, setTaxRates] = useState<any[]>([]);
  const [currencies, setCurrencies] = useState<any[]>([]);

  const resetForm = () => {
    setPlanName('');
    setPlanDescription('');
    setPlanImageUrl('');
    setPlanType('ONE_TIME');
    setPlanTaxRateId('');
    setPrices([emptyPrice('ONE_TIME')]);
  };

  const handlePlanTypeChange = (type: string) => {
    setPlanType(type);
    setPrices(prices.map(p => ({
      ...p,
      billingInterval: type === 'SUBSCRIPTION' ? (p.billingInterval || 'MONTH') : '',
    })));
  };

  const addPrice = () => {
    setPrices([...prices, { ...emptyPrice(planType), isDefault: false }]);
  };

  const removePrice = (index: number) => {
    if (prices.length <= 1) return;
    const updated = prices.filter((_, i) => i !== index);
    if (!updated.some(p => p.isDefault) && updated.length > 0) {
      updated[0].isDefault = true;
    }
    setPrices(updated);
  };

  const updatePrice = (index: number, field: keyof PriceEntry, value: string | boolean) => {
    const updated = [...prices];
    if (field === 'isDefault' && value === true) {
      updated.forEach((p, i) => { p.isDefault = i === index; });
    } else {
      (updated[index] as any)[field] = value;
    }
    setPrices(updated);
  };

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api.getProductPlans(token, { page: String(page), pageSize: '20', appId })
      .then((result) => {
        setPlans(result.items ?? []);
        setTotal(result.total ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, page, appId]);

  // Load tax rates and currencies for the selectors
  useEffect(() => {
    if (!token) return;
    api.getTaxRates(token).then((res) => setTaxRates(Array.isArray(res) ? res : [])).catch(() => {});
    api.getAvailableCurrencies(token).then((c) => setCurrencies(Array.isArray(c) ? c : [])).catch(() => {});
  }, [token]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (prices.length === 0 || prices.some(p => !p.amount)) {
      setError('Each price must have an amount');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        appId,
        name: planName,
        description: planDescription || undefined,
        imageUrl: planImageUrl || undefined,
        planType,
        taxRateId: planTaxRateId || undefined,
        prices: prices.map(p => ({
          amount: p.amount,
          currency: p.currency,
          nickname: p.nickname || undefined,
          isDefault: p.isDefault,
          ...(planType === 'SUBSCRIPTION' ? { billingInterval: p.billingInterval } : {}),
        })),
      };
      await api.createProductPlan(token, payload);
      setShowForm(false);
      resetForm();
      const result = await api.getProductPlans(token, { page: '1', pageSize: '20', appId });
      setPlans(result.items ?? []);
      setTotal(result.total ?? 0);
      setPage(1);
    } catch (err: any) {
      setError(err.message ?? 'Failed to create plan');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Product Plans</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage products and pricing ({total})</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4" /> New Plan
        </Button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
      )}

      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-semibold text-foreground">Create Product Plan</h3>
            <button onClick={() => { setShowForm(false); resetForm(); }} className="text-muted-foreground/60 hover:text-secondary-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={handleCreate} className="space-y-6">
            {/* Product details */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-secondary-foreground">Product Details</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Name *"
                  placeholder="e.g. Pro Plan, Enterprise"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  required
                />
                <Select
                  label="Type"
                  options={[
                    { value: 'ONE_TIME', label: 'One-time payment' },
                    { value: 'SUBSCRIPTION', label: 'Recurring subscription' },
                  ]}
                  value={planType}
                  onChange={(e) => handlePlanTypeChange(e.target.value)}
                />
              </div>
              <Input
                label="Description"
                placeholder="Brief description of what this plan includes"
                value={planDescription}
                onChange={(e) => setPlanDescription(e.target.value)}
              />
              {/* Tax Rate Selector */}
              {taxRates.length > 0 && (
                <Select
                  label="Tax Rate"
                  options={[
                    { value: '', label: 'No tax' },
                    ...taxRates.map((tr: any) => ({
                      value: tr.id,
                      label: `${tr.displayName} (${Number(tr.percentage)}%${tr.inclusive ? ', inclusive' : ''})${tr.jurisdiction ? ` - ${tr.jurisdiction}` : ''}`,
                    })),
                  ]}
                  value={planTaxRateId}
                  onChange={(e) => setPlanTaxRateId(e.target.value)}
                />
              )}
              <div>
                <label className="block text-sm font-medium text-secondary-foreground mb-1">Image URL</label>
                <div className="flex gap-3 items-start">
                  <div className="flex-1">
                    <input
                      type="url"
                      placeholder="https://example.com/product-image.png"
                      value={planImageUrl}
                      onChange={(e) => setPlanImageUrl(e.target.value)}
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">Optional product image shown in checkout</p>
                  </div>
                  {planImageUrl && (
                    <div className="h-12 w-12 rounded-lg border border-border overflow-hidden flex-shrink-0">
                      <img src={planImageUrl} alt="" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    </div>
                  )}
                  {!planImageUrl && (
                    <div className="h-12 w-12 rounded-lg border border-dashed border-border flex items-center justify-center flex-shrink-0">
                      <ImageIcon className="h-5 w-5 text-muted-foreground/60" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Pricing */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-secondary-foreground">Pricing</h4>
                <button type="button" onClick={addPrice} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/90">
                  <Plus className="h-3.5 w-3.5" /> Add price
                </button>
              </div>

              <div className="space-y-3">
                {prices.map((price, idx) => (
                  <div key={idx} className="relative rounded-lg border border-border bg-muted p-4">
                    {prices.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePrice(idx)}
                        className="absolute top-3 right-3 text-muted-foreground/60 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Input
                        label="Amount *"
                        placeholder="29.99"
                        value={price.amount}
                        onChange={(e) => updatePrice(idx, 'amount', e.target.value)}
                        required
                      />
                      <Select
                        label="Currency"
                        options={[
                          ...currencies.map((c: any) => ({ value: c.code, label: `${c.code} (${c.symbol})` })),
                          ...(currencies.length === 0 ? [{ value: 'USD', label: 'USD ($)' }] : []),
                        ]}
                        value={price.currency}
                        onChange={(e) => updatePrice(idx, 'currency', e.target.value)}
                      />
                      {planType === 'SUBSCRIPTION' && (
                        <Select
                          label="Billing Interval"
                          options={[
                            { value: 'MINUTE', label: '⚡ Every Minute (test)' },
                            { value: 'DAY', label: 'Daily' },
                            { value: 'WEEK', label: 'Weekly' },
                            { value: 'MONTH', label: 'Monthly' },
                            { value: 'YEAR', label: 'Yearly' },
                          ]}
                          value={price.billingInterval}
                          onChange={(e) => updatePrice(idx, 'billingInterval', e.target.value)}
                        />
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-4">
                      <Input
                        label="Nickname"
                        placeholder="e.g. Monthly, Annual Discount"
                        value={price.nickname}
                        onChange={(e) => updatePrice(idx, 'nickname', e.target.value)}
                      />
                      <div className="flex items-center gap-2 pt-5">
                        <input
                          type="radio"
                          name="defaultPrice"
                          checked={price.isDefault}
                          onChange={() => updatePrice(idx, 'isDefault', true)}
                          className="h-3.5 w-3.5 text-primary focus:ring-primary border-border"
                        />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">Default</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Tax Preview */}
              {planTaxRateId && prices.length > 0 && (() => {
                const selectedTax = taxRates.find((tr: any) => tr.id === planTaxRateId);
                if (!selectedTax) return null;
                const pct = Number(selectedTax.percentage);
                const defaultPrice = prices.find((p) => p.isDefault) ?? prices[0];
                const amt = parseFloat(defaultPrice?.amount || '0');
                if (!amt || amt <= 0) return null;
                const isInclusive = selectedTax.inclusive;
                const subtotal = isInclusive ? Math.round((amt / (1 + pct / 100)) * 100) / 100 : amt;
                const taxAmount = isInclusive ? Math.round((amt - subtotal) * 100) / 100 : Math.round((amt * pct / 100) * 100) / 100;
                const total = isInclusive ? amt : Math.round((amt + taxAmount) * 100) / 100;
                return (
                  <div className="rounded-lg border border-border bg-muted p-3 space-y-1">
                    <p className="text-xs font-medium text-secondary-foreground">Price Preview ({selectedTax.displayName} {pct}%{isInclusive ? ', inclusive' : ''})</p>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Subtotal</span>
                      <span>{subtotal.toFixed(2)} {(defaultPrice?.currency || 'USD').toUpperCase()}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Tax</span>
                      <span>+{taxAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-medium text-foreground border-t border-border pt-1">
                      <span>Customer pays</span>
                      <span>{total.toFixed(2)} {(defaultPrice?.currency || 'USD').toUpperCase()}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="secondary" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Plan'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <Spinner />
      ) : plans.length === 0 ? (
        <EmptyState
          title="No product plans"
          description="Create products and pricing for checkout sessions and subscriptions"
          icon={Package}
          action={<Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> New Plan</Button>}
        />
      ) : (
        <>
          <Table headers={['Product', 'ID', 'Type', 'Pricing', 'Tax', 'Status', 'Created']}>
            {plans.map((plan: any) => {
              const defaultPrice = plan.prices?.find((p: any) => p.isDefault) ?? plan.prices?.[0];
              return (
                <tr
                  key={plan.id}
                  className="hover:bg-muted transition-colors cursor-pointer"
                  onClick={() => router.push(`/dashboard/apps/${appId}/product-plans/${plan.id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {plan.imageUrl ? (
                        <div className="h-9 w-9 rounded-lg border border-border overflow-hidden flex-shrink-0">
                          <img src={plan.imageUrl} alt="" className="h-full w-full object-cover" />
                        </div>
                      ) : (
                        <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-foreground">{plan.name}</p>
                        {plan.description && <p className="text-xs text-muted-foreground mt-0.5 max-w-[200px] truncate">{plan.description}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <CopyableId value={plan.id} chars={6} />
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={plan.planType === 'SUBSCRIPTION' ? 'default' : 'outline'}>
                      {plan.planType === 'SUBSCRIPTION' ? 'Subscription' : 'One-time'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {defaultPrice ? (
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {defaultPrice.amount} {defaultPrice.currency}
                          {defaultPrice.billingInterval && <span className="text-muted-foreground font-normal"> / {defaultPrice.billingInterval.toLowerCase()}</span>}
                        </p>
                        {plan.taxRate && (() => {
                          const amt = Number(defaultPrice.amount);
                          const pct = Number(plan.taxRate.percentage);
                          const total = plan.taxRate.inclusive ? amt : Math.round((amt + amt * pct / 100) * 100) / 100;
                          return (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {plan.taxRate.inclusive ? 'incl.' : '+'} {pct}% tax = {total.toFixed(2)} {defaultPrice.currency}
                            </p>
                          );
                        })()}
                        {(plan.prices?.length ?? 0) > 1 && (
                          <p className="text-xs text-muted-foreground mt-0.5">+{plan.prices.length - 1} more</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground/60">No prices</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {plan.taxRate ? (
                      <span className="text-sm text-foreground">
                        {plan.taxRate.displayName} ({Number(plan.taxRate.percentage)}%)
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground/60">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={plan.isActive ? 'success' : 'outline'}>
                      {plan.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {new Date(plan.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
          </Table>

          {total > 20 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-lg px-3 py-1.5 text-sm text-secondary-foreground hover:bg-muted disabled:opacity-40">Previous</button>
              <span className="text-sm text-muted-foreground">Page {page} of {Math.ceil(total / 20)}</span>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= Math.ceil(total / 20)} className="rounded-lg px-3 py-1.5 text-sm text-secondary-foreground hover:bg-muted disabled:opacity-40">Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

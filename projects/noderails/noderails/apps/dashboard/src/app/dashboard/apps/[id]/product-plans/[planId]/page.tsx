'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { Badge, Button, Card, Input, Select, Textarea, Spinner, Toggle } from '@/components/ui';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ArrowLeft, Plus, X, Pencil, Trash2 } from 'lucide-react';

export default function ProductPlanDetailPage() {
  const { id: appId, planId } = useParams<{ id: string; planId: string }>();
  const { token } = useAuth();
  const router = useRouter();

  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Edit plan state
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({ name: '', description: '', imageUrl: '' });
  const [saving, setSaving] = useState(false);

  // Add price form state
  const [showPriceForm, setShowPriceForm] = useState(false);
  const [priceFormData, setPriceFormData] = useState({
    amount: '',
    currency: 'USD',
    billingInterval: 'MONTH',
    nickname: '',
    isDefault: false,
  });
  const [priceSubmitting, setPriceSubmitting] = useState(false);

  // Edit price state
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editPriceData, setEditPriceData] = useState({
    amount: '',
    nickname: '',
    isDefault: false,
  });
  const [deactivateTarget, setDeactivateTarget] = useState<{ id: string; name: string } | null>(null);

  const loadPlan = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await api.getProductPlan(token, planId);
      setPlan(result);
      setEditData({
        name: result.name ?? '',
        description: result.description ?? '',
        imageUrl: result.imageUrl ?? '',
      });
    } catch {
      setError('Failed to load product plan');
    } finally {
      setLoading(false);
    }
  }, [token, planId]);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  const handleUpdatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        name: editData.name,
        description: editData.description || undefined,
        imageUrl: editData.imageUrl || undefined,
      };
      const result = await api.updateProductPlan(token, planId, payload);
      setPlan(result);
      setEditing(false);
    } catch (err: any) {
      setError(err.message ?? 'Failed to update plan');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!token || !plan) return;
    setError('');
    try {
      const result = await api.updateProductPlan(token, planId, { isActive: !plan.isActive });
      setPlan(result);
    } catch (err: any) {
      setError(err.message ?? 'Failed to update plan status');
    }
  };

  const handleAddPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setPriceSubmitting(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        amount: priceFormData.amount,
        currency: priceFormData.currency,
        nickname: priceFormData.nickname || undefined,
        isDefault: priceFormData.isDefault,
      };
      if (plan.planType === 'SUBSCRIPTION') {
        payload.billingInterval = priceFormData.billingInterval;
      }
      await api.addProductPlanPrice(token, planId, payload);
      setShowPriceForm(false);
      setPriceFormData({ amount: '', currency: 'USD', billingInterval: 'MONTH', nickname: '', isDefault: false });
      await loadPlan();
    } catch (err: any) {
      setError(err.message ?? 'Failed to add price');
    } finally {
      setPriceSubmitting(false);
    }
  };

  const handleUpdatePrice = async (priceId: string) => {
    if (!token) return;
    setError('');
    try {
      await api.updateProductPlanPrice(token, planId, priceId, {
        amount: editPriceData.amount,
        nickname: editPriceData.nickname || undefined,
        isDefault: editPriceData.isDefault,
      });
      setEditingPriceId(null);
      await loadPlan();
    } catch (err: any) {
      setError(err.message ?? 'Failed to update price');
    }
  };

  const handleDeactivatePrice = async (priceId: string) => {
    if (!token) return;
    setError('');
    try {
      await api.deactivateProductPlanPrice(token, planId, priceId);
      await loadPlan();
    } catch (err: any) {
      setError(err.message ?? 'Failed to deactivate price');
    }
    setDeactivateTarget(null);
  };

  const startEditPrice = (price: any) => {
    setEditingPriceId(price.id);
    setEditPriceData({
      amount: String(price.amount),
      nickname: price.nickname ?? '',
      isDefault: price.isDefault,
    });
  };

  if (loading) return <Spinner />;
  if (!plan) return <p className="text-sm text-red-600">{error || 'Plan not found'}</p>;

  const activePrices = (plan.prices ?? []).filter((p: any) => p.isActive);
  const inactivePrices = (plan.prices ?? []).filter((p: any) => !p.isActive);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push(`/dashboard/apps/${appId}/product-plans`)}
          className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{plan.name}</h1>
            <Badge variant={plan.isActive ? 'success' : 'outline'}>
              {plan.isActive ? 'Active' : 'Inactive'}
            </Badge>
            <Badge variant={plan.planType === 'SUBSCRIPTION' ? 'default' : 'outline'}>
              {plan.planType === 'SUBSCRIPTION' ? 'Subscription' : 'One-time'}
            </Badge>
          </div>
          {plan.description && <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditing(!editing)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleToggleActive}
          >
            {plan.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
      )}

      {/* Edit Plan Form */}
      {editing && (
        <Card>
          <h3 className="text-sm font-semibold mb-4">Edit Plan Details</h3>
          <form onSubmit={handleUpdatePlan} className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Name"
              value={editData.name}
              onChange={(e) => setEditData({ ...editData, name: e.target.value })}
              required
            />
            <Input
              label="Image URL (optional)"
              placeholder="https://..."
              value={editData.imageUrl}
              onChange={(e) => setEditData({ ...editData, imageUrl: e.target.value })}
            />
            <Textarea
              label="Description"
              value={editData.description}
              onChange={(e) => setEditData({ ...editData, description: e.target.value })}
              rows={2}
              className="sm:col-span-2"
            />
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Plan Info */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Plan ID</p>
          <p className="text-sm text-foreground font-mono truncate">{plan.id}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Prices</p>
          <p className="text-2xl font-bold text-foreground">{activePrices.length}</p>
          {inactivePrices.length > 0 && (
            <p className="text-xs text-muted-foreground/60 mt-0.5">{inactivePrices.length} inactive</p>
          )}
        </Card>
        <Card>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Created</p>
          <p className="text-sm text-foreground">{new Date(plan.createdAt).toLocaleDateString()}</p>
        </Card>
      </div>

      {/* Prices Section */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Pricing</h3>
          <Button size="sm" onClick={() => setShowPriceForm(!showPriceForm)}>
            <Plus className="h-3.5 w-3.5" /> Add Price
          </Button>
        </div>

        {/* Add Price Form */}
        {showPriceForm && (
          <div className="mb-4 rounded-xl border border-border bg-muted p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-foreground">New Price</p>
              <button onClick={() => setShowPriceForm(false)} className="text-muted-foreground/60 hover:text-secondary-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleAddPrice} className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Amount"
                placeholder="29.99"
                value={priceFormData.amount}
                onChange={(e) => setPriceFormData({ ...priceFormData, amount: e.target.value })}
                required
              />
              <Input
                label="Currency"
                placeholder="USD"
                value={priceFormData.currency}
                onChange={(e) => setPriceFormData({ ...priceFormData, currency: e.target.value })}
              />
              {plan.planType === 'SUBSCRIPTION' && (
                <Select
                  label="Billing Interval"
                  options={[
                    { value: 'MINUTE', label: '⚡ Every Minute (test)' },
                    { value: 'DAY', label: 'Daily' },
                    { value: 'WEEK', label: 'Weekly' },
                    { value: 'MONTH', label: 'Monthly' },
                    { value: 'YEAR', label: 'Yearly' },
                  ]}
                  value={priceFormData.billingInterval}
                  onChange={(e) => setPriceFormData({ ...priceFormData, billingInterval: e.target.value })}
                />
              )}
              <Input
                label="Nickname (optional)"
                placeholder="e.g. Monthly, Annual"
                value={priceFormData.nickname}
                onChange={(e) => setPriceFormData({ ...priceFormData, nickname: e.target.value })}
              />
              <div className="flex items-center gap-2 sm:col-span-2">
                <Toggle
                  checked={priceFormData.isDefault}
                  onChange={(v) => setPriceFormData({ ...priceFormData, isDefault: v })}
                  label="Default price"
                />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowPriceForm(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={priceSubmitting}>
                  {priceSubmitting ? 'Adding...' : 'Add Price'}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Prices List */}
        {activePrices.length === 0 && !showPriceForm ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No active prices. Add a price to use this plan.</p>
        ) : (
          <div className="space-y-2">
            {activePrices.map((price: any) => (
              <div
                key={price.id}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-3 hover:border-primary/30 transition-colors"
              >
                {editingPriceId === price.id ? (
                  <div className="flex-1 grid gap-3 sm:grid-cols-4 items-end">
                    <Input
                      label="Amount"
                      value={editPriceData.amount}
                      onChange={(e) => setEditPriceData({ ...editPriceData, amount: e.target.value })}
                    />
                    <Input
                      label="Nickname"
                      value={editPriceData.nickname}
                      onChange={(e) => setEditPriceData({ ...editPriceData, nickname: e.target.value })}
                    />
                    <div className="flex items-center gap-2">
                      <Toggle
                        checked={editPriceData.isDefault}
                        onChange={(v) => setEditPriceData({ ...editPriceData, isDefault: v })}
                        label="Default"
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="secondary" onClick={() => setEditingPriceId(null)}>Cancel</Button>
                      <Button size="sm" onClick={() => handleUpdatePrice(price.id)}>Save</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-semibold text-foreground">
                            {price.amount} {price.currency}
                          </span>
                          {price.billingInterval && (
                            <span className="text-sm text-muted-foreground">/ {price.billingInterval.toLowerCase()}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {price.nickname && (
                            <span className="text-xs text-muted-foreground">{price.nickname}</span>
                          )}
                          {price.isDefault && <Badge variant="default">Default</Badge>}
                          <span className="text-xs text-muted-foreground/60 font-mono">{price.id.slice(0, 4)}...{price.id.slice(-4)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => startEditPrice(price)}
                        title="Edit price"
                        className="rounded-md p-1.5 text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeactivateTarget({ id: price.id, name: price.nickname ?? price.id })}
                        title="Deactivate price"
                        className="rounded-md p-1.5 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Inactive Prices */}
        {inactivePrices.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-2">Inactive Prices</p>
            <div className="space-y-1.5">
              {inactivePrices.map((price: any) => (
                <div
                  key={price.id}
                  className="flex items-center justify-between rounded-lg border border-dashed border-border px-4 py-2.5 opacity-60"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground line-through">
                      {price.amount} {price.currency}
                      {price.billingInterval && ` / ${price.billingInterval.toLowerCase()}`}
                    </span>
                    {price.nickname && (
                      <span className="text-xs text-muted-foreground/60">{price.nickname}</span>
                    )}
                  </div>
                  <Badge variant="outline">Inactive</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!deactivateTarget}
        onOpenChange={(open) => !open && setDeactivateTarget(null)}
        title="Deactivate Price"
        description={`Deactivate price "${deactivateTarget?.name}"? This cannot be undone.`}
        confirmLabel="Deactivate"
        onConfirm={() => deactivateTarget && handleDeactivatePrice(deactivateTarget.id)}
      />
    </div>
  );
}

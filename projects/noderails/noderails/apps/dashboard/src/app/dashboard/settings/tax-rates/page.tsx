'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { Card, Button, Input } from '@/components/ui';
import { Plus, Percent, Pencil, Archive, ChevronLeft } from 'lucide-react';
import Link from 'next/link';

interface TaxRate {
  id: string;
  displayName: string;
  percentage: number;
  inclusive: boolean;
  jurisdiction: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

export default function TaxRatesPage() {
  const { token } = useAuth();
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formPercentage, setFormPercentage] = useState('');
  const [formInclusive, setFormInclusive] = useState(false);
  const [formJurisdiction, setFormJurisdiction] = useState('');
  const [formDescription, setFormDescription] = useState('');

  const loadTaxRates = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getTaxRates(token, showInactive);
      setTaxRates(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, showInactive]);

  useEffect(() => {
    loadTaxRates();
  }, [loadTaxRates]);

  const resetForm = () => {
    setFormName('');
    setFormPercentage('');
    setFormInclusive(false);
    setFormJurisdiction('');
    setFormDescription('');
    setEditingId(null);
    setShowForm(false);
    setError('');
  };

  const startEdit = (rate: TaxRate) => {
    setFormName(rate.displayName);
    setFormPercentage(String(rate.percentage));
    setFormInclusive(rate.inclusive);
    setFormJurisdiction(rate.jurisdiction ?? '');
    setFormDescription(rate.description ?? '');
    setEditingId(rate.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setError('');

    const pct = parseFloat(formPercentage);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setError('Percentage must be between 0 and 100');
      setSaving(false);
      return;
    }

    try {
      if (editingId) {
        await api.updateTaxRate(token, editingId, {
          displayName: formName.trim(),
          percentage: pct,
          inclusive: formInclusive,
          jurisdiction: formJurisdiction.trim() || undefined,
          description: formDescription.trim() || undefined,
        });
      } else {
        await api.createTaxRate(token, {
          displayName: formName.trim(),
          percentage: pct,
          inclusive: formInclusive,
          jurisdiction: formJurisdiction.trim() || undefined,
          description: formDescription.trim() || undefined,
        });
      }
      resetForm();
      await loadTaxRates();
    } catch (err: any) {
      setError(err.message ?? 'Failed to save tax rate');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (id: string) => {
    if (!token) return;
    try {
      await api.archiveTaxRate(token, id);
      await loadTaxRates();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleReactivate = async (id: string) => {
    if (!token) return;
    try {
      await api.updateTaxRate(token, id, { isActive: true });
      await loadTaxRates();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ChevronLeft className="h-4 w-4" />
          Settings
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Tax Rates</h1>
            <p className="text-sm text-muted-foreground">
              Create and manage tax rates applied to invoices and payment links
            </p>
          </div>
          {!showForm && (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" />
              New Tax Rate
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Create/Edit Form */}
      {showForm && (
        <Card>
          <h2 className="text-sm font-semibold text-foreground mb-4">
            {editingId ? 'Edit Tax Rate' : 'New Tax Rate'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Display Name"
                placeholder="GST, VAT, Sales Tax..."
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
              />
              <Input
                label="Percentage (%)"
                placeholder="18.00"
                value={formPercentage}
                onChange={(e) => setFormPercentage(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Jurisdiction (optional)"
                placeholder="IN, US-CA, EU..."
                value={formJurisdiction}
                onChange={(e) => setFormJurisdiction(e.target.value)}
              />
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tax Behavior</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setFormInclusive(false)}
                    className={`flex-1 rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                      !formInclusive
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:border-border'
                    }`}
                  >
                    Exclusive
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormInclusive(true)}
                    className={`flex-1 rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                      formInclusive
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:border-border'
                    }`}
                  >
                    Inclusive
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {formInclusive
                    ? 'Tax is included in item prices (reverse-calculated)'
                    : 'Tax is added on top of item prices'}
                </p>
              </div>
            </div>

            <Input
              label="Description (optional)"
              placeholder="Applicable to domestic transactions..."
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
            />

            <div className="flex gap-3">
              <Button type="submit" disabled={saving || !formName.trim() || !formPercentage}>
                {saving ? 'Saving...' : editingId ? 'Update Tax Rate' : 'Create Tax Rate'}
              </Button>
              <Button type="button" variant="secondary" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Toggle inactive */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-border text-primary focus:ring-primary"
          />
          Show archived rates
        </label>
      </div>

      {/* Tax Rates List */}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : taxRates.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted mb-3">
              <Percent className="h-5 w-5 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">No tax rates yet</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Create a tax rate to apply taxes to invoices and payment links
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {taxRates.map((rate) => (
            <Card key={rate.id}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/5">
                    <Percent className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {rate.displayName}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                        {Number(rate.percentage)}%
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          rate.inclusive
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-blue-50 text-blue-600'
                        }`}
                      >
                        {rate.inclusive ? 'Inclusive' : 'Exclusive'}
                      </span>
                      {!rate.isActive && (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                          Archived
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {rate.jurisdiction && (
                        <span className="text-xs text-muted-foreground">{rate.jurisdiction}</span>
                      )}
                      {rate.description && (
                        <span className="text-xs text-muted-foreground">· {rate.description}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {rate.isActive ? (
                    <>
                      <button
                        onClick={() => startEdit(rate)}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleArchive(rate.id)}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                        title="Archive"
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => handleReactivate(rate.id)}>
                      Reactivate
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

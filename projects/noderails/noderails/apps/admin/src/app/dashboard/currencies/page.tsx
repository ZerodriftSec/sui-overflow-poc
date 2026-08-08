'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAdminAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { Card, Table, Badge, Button, Input, Toggle, Spinner, EmptyState } from '@/components/ui';
import { DollarSign, Plus, Pencil, Trash2, X, Loader2 } from 'lucide-react';

interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  isEnabled: boolean;
  createdAt: string;
}

export default function CurrenciesPage() {
  const { token } = useAdminAuth();
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ code: '', name: '', symbol: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getCurrencies(token);
      setCurrencies(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setFormData({ code: '', name: '', symbol: '' });
    setEditingId(null);
    setShowForm(false);
    setError('');
  };

  const startEdit = (c: Currency) => {
    setFormData({ code: c.code, name: c.name, symbol: c.symbol });
    setEditingId(c.id);
    setShowForm(true);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError('');
    try {
      if (editingId) {
        await api.updateCurrency(token, editingId, formData);
      } else {
        await api.createCurrency(token, formData);
      }
      resetForm();
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (c: Currency) => {
    if (!token || !confirm(`Delete currency ${c.code}?`)) return;
    try {
      await api.deleteCurrency(token, c.id);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggle = async (c: Currency) => {
    if (!token) return;
    try {
      await api.updateCurrency(token, c.id, { isEnabled: !c.isEnabled });
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#0a2540]">Supported Currencies</h1>
          <p className="text-sm text-[#425466] mt-1">
            Manage fiat currencies available for payment links, invoices, and checkout sessions.
          </p>
        </div>
        {!showForm && (
          <Button onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="h-4 w-4" /> Add Currency
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="space-y-4 p-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-medium text-[#0a2540]">{editingId ? 'Edit Currency' : 'Add Currency'}</h2>
              <button type="button" onClick={resetForm} className="text-[#a3acb9] hover:text-[#425466]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Code (ISO 4217)"
                placeholder="USD"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                required
                maxLength={10}
              />
              <Input
                label="Name"
                placeholder="US Dollar"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
              <Input
                label="Symbol"
                placeholder="$"
                value={formData.symbol}
                onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                required
                maxLength={5}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={resetForm}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingId ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {currencies.length === 0 ? (
        <EmptyState
          icon={DollarSign}
          title="No currencies configured"
          description="Add supported fiat currencies for your platform."
          action={<Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Add Currency</Button>}
        />
      ) : (
        <Table headers={['Code', 'Name', 'Symbol', 'Enabled', 'Actions']}>
          {currencies.map((c) => (
            <tr key={c.id} className="hover:bg-[#f6f8fa] transition-colors">
              <td className="px-4 py-3 text-sm font-mono font-semibold text-[#0a2540]">{c.code}</td>
              <td className="px-4 py-3 text-sm text-[#425466]">{c.name}</td>
              <td className="px-4 py-3 text-lg">{c.symbol}</td>
              <td className="px-4 py-3">
                <Toggle checked={c.isEnabled} onChange={() => handleToggle(c)} />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => startEdit(c)} className="text-[#a3acb9] hover:text-[#635bff] transition-colors">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDelete(c)} className="text-[#a3acb9] hover:text-red-600 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

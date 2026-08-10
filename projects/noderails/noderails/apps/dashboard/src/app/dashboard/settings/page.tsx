'use client';

import { useState } from 'react';
import { useAuth, usePermission } from '@/lib/auth';
import * as api from '@/lib/api';
import { Card, Button, Input } from '@/components/ui';
import { Save, User, Building2, Percent, Users, ChevronRight } from 'lucide-react';
import Link from 'next/link';

export default function SettingsPage() {
  const { merchant, token, updateMerchant } = useAuth();
  const hasPermission = usePermission();
  const [merchantType, setMerchantType] = useState<'BUSINESS' | 'INDIVIDUAL'>(merchant?.merchantType ?? 'BUSINESS');
  const [businessName, setBusinessName] = useState(merchant?.businessName ?? merchant?.orgName ?? '');
  const [individualName, setIndividualName] = useState(merchant?.individualName ?? '');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const currentLabel = merchantType === 'BUSINESS' ? 'Organization name' : 'Individual name';
  const currentNameValue = merchantType === 'BUSINESS' ? businessName : individualName;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const trimmedName = currentNameValue.trim();
      if (!trimmedName) {
        setError(`${currentLabel} is required`);
        setSaving(false);
        return;
      }
      const payload = {
        merchantType,
        ...(merchantType === 'BUSINESS'
          ? { businessName: trimmedName }
          : { individualName: trimmedName }),
      };
      const updated = await api.updateProfile(token, payload);
      updateMerchant({
        merchantType: updated.merchantType,
        businessName: updated.businessName,
        individualName: updated.individualName,
        orgName: updated.orgName,
      });
      if (updated.businessName !== undefined) setBusinessName(updated.businessName ?? '');
      if (updated.individualName !== undefined) setIndividualName(updated.individualName ?? '');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account and organization</p>
      </div>

      {/* Account Info */}
      <Card>
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <User className="h-4 w-4 text-secondary-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Account</h2>
            <p className="text-xs text-muted-foreground">Your login and account details</p>
          </div>
        </div>
        <div className="grid gap-4">
          <Input label="Email" value={merchant?.email ?? ''} disabled />
          <Input label="Role" value={merchant?.role === 'ADMIN' ? 'Admin' : 'Merchant'} disabled />
          <Input label="Merchant ID" value={merchant?.id ?? ''} disabled />
        </div>
      </Card>

      {/* Organization Info */}
      <Card>
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <Building2 className="h-4 w-4 text-secondary-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Organization</h2>
            <p className="text-xs text-muted-foreground">Displayed on checkout pages to your customers</p>
          </div>
        </div>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Merchant type</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMerchantType('BUSINESS')}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  merchantType === 'BUSINESS'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                Business
              </button>
              <button
                type="button"
                onClick={() => setMerchantType('INDIVIDUAL')}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  merchantType === 'INDIVIDUAL'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                Individual
              </button>
            </div>
          </div>

          <Input
            label={currentLabel}
            placeholder={merchantType === 'BUSINESS' ? 'Acme Inc.' : 'Jane Doe'}
            value={currentNameValue}
            onChange={(e) => {
              if (merchantType === 'BUSINESS') setBusinessName(e.target.value);
              else setIndividualName(e.target.value);
            }}
          />

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-300 p-3 text-sm text-emerald-700">
              Settings saved successfully
            </div>
          )}

          <Button type="submit" disabled={saving || !currentNameValue.trim()}>
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        </form>
      </Card>

      {/* Team Members Link */}
      {hasPermission('TEAM_MANAGE') && (
      <Link href="/dashboard/settings/team">
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/5">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Team Members</h2>
                <p className="text-xs text-muted-foreground">
                  Invite people and manage org &amp; app-level access
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </Card>
      </Link>
      )}

      {/* Tax Rates Link */}
      {hasPermission('SETTINGS_MANAGE') && (
      <Link href="/dashboard/settings/tax-rates">
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/5">
                <Percent className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Tax Rates</h2>
                <p className="text-xs text-muted-foreground">
                  Manage tax rates for invoices and payment links
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </Card>
      </Link>
      )}
    </div>
  );
}

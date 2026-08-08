'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { Button, Input } from '@/components/ui';
import { MerchantWalletConnect } from '@/components/merchant-wallet-connect';
import { saveMerchantWalletConfig } from '@/lib/save-merchant-wallet';
import type { MerchantChainFamily } from '@/lib/merchant-wallet-networks';
import { Building2, Zap, Wallet, Check, ChevronRight, ArrowLeft } from 'lucide-react';

const STEPS = [
  { title: 'Profile', icon: Building2 },
  { title: 'Create App', icon: Zap },
  { title: 'Connect Wallet', icon: Wallet },
] as const;

export function OnboardingWizard({ onComplete }: { onComplete: (appId: string) => void }) {
  const { token, updateMerchant } = useAuth();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Step 1
  const [merchantType, setMerchantType] = useState<'BUSINESS' | 'INDIVIDUAL'>('BUSINESS');
  const [businessName, setBusinessName] = useState('');
  const [individualName, setIndividualName] = useState('');

  // Step 2
  const [appName, setAppName] = useState('');
  const [appEnv, setAppEnv] = useState<'TEST' | 'PRODUCTION'>('TEST');
  const [createdApp, setCreatedApp] = useState<{ id: string; name: string } | null>(null);

  // Step 3 — connect + verify one receiving wallet (EVM, Solana, or Sui)
  const [walletData, setWalletData] = useState<{
    family: MerchantChainFamily;
    address: string;
    signature: string;
  } | null>(null);

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    const name = merchantType === 'BUSINESS' ? businessName.trim() : individualName.trim();
    if (!name) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        merchantType,
        ...(merchantType === 'BUSINESS' ? { businessName: name } : { individualName: name }),
      };
      const updated = await api.updateProfile(token, payload);
      updateMerchant({
        merchantType: updated.merchantType,
        businessName: updated.businessName,
        individualName: updated.individualName,
        orgName: updated.orgName,
      });
      setStep(1);
    } catch (err: any) {
      setError(err.message ?? 'Failed to save merchant profile');
    } finally {
      setSaving(false);
    }
  }

  async function handleAppSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !appName.trim()) return;
    setSaving(true);
    setError('');
    try {
      const app = await api.createApp(token, { name: appName.trim(), environment: appEnv });
      setCreatedApp({ id: app.id, name: app.name });
      setStep(2);
    } catch (err: any) {
      setError(err.message ?? 'Failed to create app');
    } finally {
      setSaving(false);
    }
  }

  async function handleWalletComplete() {
    if (!token || !createdApp || !walletData) return;
    setSaving(true);
    setError('');
    try {
      await saveMerchantWalletConfig({
        token,
        appId: createdApp.id,
        appEnv,
        walletType: 'receiving',
        family: walletData.family,
        address: walletData.address,
        signature: walletData.signature,
      });
      onComplete(createdApp.id);
    } catch (err: any) {
      setError(err.message ?? 'Failed to save wallets');
    } finally {
      setSaving(false);
    }
  }

  function handleSkipWallet() {
    if (createdApp) {
      onComplete(createdApp.id);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-[0_8px_40px_rgba(0,0,0,0.12)]">
        {/* Header */}
        <div className="border-b border-border px-8 pt-8 pb-6">
          <h2 className="text-xl font-bold text-foreground">Welcome to NodeRails</h2>
          <p className="mt-1 text-sm text-muted-foreground">Let&apos;s get you set up in a few quick steps</p>

          {/* Progress steps */}
          <div className="mt-6 flex items-center gap-2">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === step;
              const isDone = i < step;
              return (
                <div key={i} className="flex items-center gap-2 flex-1">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
                      isDone
                        ? 'bg-emerald-500 text-white'
                        : isActive
                          ? 'bg-primary text-white'
                          : 'bg-muted text-muted-foreground/60'
                    }`}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      isDone ? 'text-emerald-500' : isActive ? 'text-foreground' : 'text-muted-foreground/60'
                    }`}
                  >
                    {s.title}
                  </span>
                  {i < STEPS.length - 1 && (
                    <div className={`ml-auto h-px flex-1 ${isDone ? 'bg-emerald-500' : 'bg-muted'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="px-8 py-6">
          {error && (
            <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Step 1: Merchant profile */}
          {step === 0 && (
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-foreground">Are you an individual or a business?</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  This will appear on checkout pages and invoices
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMerchantType('BUSINESS')}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                    merchantType === 'BUSINESS'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
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
                      : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  Individual
                </button>
              </div>

              {merchantType === 'BUSINESS' ? (
                <Input
                  label="Organization name"
                  placeholder="Acme Inc."
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                />
              ) : (
                <Input
                  label="Individual name"
                  placeholder="Jane Doe"
                  value={individualName}
                  onChange={(e) => setIndividualName(e.target.value)}
                  required
                />
              )}

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={
                    saving || (merchantType === 'BUSINESS' ? !businessName.trim() : !individualName.trim())
                  }
                >
                  {saving ? 'Saving...' : 'Continue'}
                  {!saving && <ChevronRight className="h-4 w-4" />}
                </Button>
              </div>
            </form>
          )}

          {/* Step 2: Create first app */}
          {step === 1 && (
            <form onSubmit={handleAppSubmit} className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-foreground">Create your first app</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Apps let you manage API keys, configure chains & tokens, and accept payments
                </p>
              </div>
              <Input
                label="App name"
                placeholder="My Payment App"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                required
              />
              <div>
                <p className="text-[13px] font-medium text-secondary-foreground mb-1.5">Environment</p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setAppEnv('TEST')}
                    className={`flex-1 rounded-lg border-2 px-3 py-2.5 text-left transition-all cursor-pointer ${
                      appEnv === 'TEST'
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-border bg-card hover:border-muted-foreground/40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${appEnv === 'TEST' ? 'bg-amber-500' : 'bg-muted-foreground/40'}`} />
                      <span className="text-sm font-semibold text-foreground">Test</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Testnet &middot; No real funds</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAppEnv('PRODUCTION')}
                    className={`flex-1 rounded-lg border-2 px-3 py-2.5 text-left transition-all cursor-pointer ${
                      appEnv === 'PRODUCTION'
                        ? 'border-emerald-500 bg-green-50'
                        : 'border-border bg-card hover:border-muted-foreground/40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${appEnv === 'PRODUCTION' ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                      <span className="text-sm font-semibold text-foreground">Production</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Mainnet &middot; Real payments</p>
                  </button>
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={saving || !appName.trim()}>
                  {saving ? 'Creating...' : 'Create & continue'}
                  {!saving && <ChevronRight className="h-4 w-4" />}
                </Button>
              </div>
            </form>
          )}

          {/* Step 3: Connect + sign (EVM like before; Solana added for same flow) */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-foreground">Connect wallets</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pick EVM, Solana, or Sui, connect your wallet, then sign to verify. Finish after connecting one, or skip.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <MerchantWalletConnect
                  appName={createdApp?.name ?? 'App'}
                  appEnv={appEnv}
                  walletType="receiving"
                  onVerified={(family, address, signature) =>
                    setWalletData({ family, address, signature })
                  }
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleSkipWallet}
                  className="text-sm text-muted-foreground hover:text-secondary-foreground transition-colors cursor-pointer"
                >
                  Skip for now
                </button>
                {walletData && (
                  <Button onClick={handleWalletComplete} disabled={saving}>
                    {saving ? 'Finishing...' : 'Finish setup'}
                    {!saving && <Check className="h-4 w-4" />}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

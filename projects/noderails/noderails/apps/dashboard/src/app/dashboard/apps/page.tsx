'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { Card, Badge, Button, Input, Spinner, EmptyState } from '@/components/ui';
import { MerchantWalletConnect } from '@/components/merchant-wallet-connect';
import { saveMerchantWalletConfig } from '@/lib/save-merchant-wallet';
import type { MerchantChainFamily } from '@/lib/merchant-wallet-networks';
import { Plus, Zap, MoreHorizontal, ChevronRight } from 'lucide-react';

export default function AppsPage() {
  const { token } = useAuth();
  const router = useRouter();
  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newAppName, setNewAppName] = useState('');
  const [newAppEnv, setNewAppEnv] = useState<'TEST' | 'PRODUCTION'>('TEST');
  const [walletData, setWalletData] = useState<{
    family: MerchantChainFamily;
    address: string;
    signature: string;
  } | null>(null);
  const [creating, setCreating] = useState(false);

  const loadApps = async () => {
    if (!token) return;
    try {
      const result = await api.getApps(token);
      setApps(Array.isArray(result) ? result : []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadApps(); }, [token]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newAppName.trim()) return;
    setCreating(true);
    try {
      const app = await api.createApp(token, { name: newAppName.trim(), environment: newAppEnv });
      if (walletData) {
        await saveMerchantWalletConfig({
          token,
          appId: app.id,
          appEnv: newAppEnv,
          walletType: 'receiving',
          family: walletData.family,
          address: walletData.address,
          signature: walletData.signature,
        });
      }
      setNewAppName('');
      setNewAppEnv('TEST');
      setWalletData(null);
      setShowCreate(false);
      // Navigate to the newly created app to immediately show app links in sidebar
      router.push(`/dashboard/apps/${app.id}`);
    } catch {
      /* ignore */
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Apps</h1>
          <p className="text-sm text-muted-foreground">Manage your applications and configure networks</p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)}>
          <Plus className="h-4 w-4" /> New App
        </Button>
      </div>

      {showCreate && (
        <Card>
          <form onSubmit={handleCreate} className="space-y-4">
            <Input
              label="App name"
              placeholder="My Payment App"
              value={newAppName}
              onChange={(e) => setNewAppName(e.target.value)}
              required
            />
            <div>
              <p className="text-[13px] font-medium text-secondary-foreground mb-1.5">Environment</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setNewAppEnv('TEST')}
                  className={`flex-1 rounded-lg border-2 px-4 py-3 text-left transition-all cursor-pointer ${
                    newAppEnv === 'TEST'
                      ? 'border-amber-400 bg-amber-50'
                      : 'border-border bg-card hover:border-muted-foreground/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${newAppEnv === 'TEST' ? 'bg-amber-500' : 'bg-muted-foreground/40'}`} />
                    <span className="text-sm font-semibold text-foreground">Test</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Testnet chains &middot; No real funds</p>
                </button>
                <button
                  type="button"
                  onClick={() => setNewAppEnv('PRODUCTION')}
                  className={`flex-1 rounded-lg border-2 px-4 py-3 text-left transition-all cursor-pointer ${
                    newAppEnv === 'PRODUCTION'
                      ? 'border-emerald-500 bg-green-50'
                      : 'border-border bg-card hover:border-muted-foreground/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${newAppEnv === 'PRODUCTION' ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                    <span className="text-sm font-semibold text-foreground">Production</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Mainnet chains &middot; Real payments</p>
                </button>
              </div>
            </div>
            <div>
              <p className="text-[13px] font-medium text-secondary-foreground mb-1.5">Receiving wallet (optional)</p>
              <MerchantWalletConnect
                appName={newAppName || 'New App'}
                appEnv={newAppEnv}
                walletType="receiving"
                onVerified={(family, address, signature) =>
                  setWalletData({ family, address, signature })
                }
              />
            </div>
            <div className="flex gap-3">
              <Button type="submit" disabled={creating}>
                {creating ? 'Creating...' : 'Create app'}
              </Button>
              <Button variant="ghost" type="button" onClick={() => { setShowCreate(false); setWalletData(null); }}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {apps.length === 0 ? (
        <EmptyState
          title="No apps yet"
          description="Create an app to get API keys and start accepting payments"
          icon={Zap}
          action={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> Create your first app
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
            <button
              key={app.id}
              onClick={() => router.push(`/dashboard/apps/${app.id}`)}
              className="w-full text-left rounded-xl border border-border bg-card p-5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/8 transition-all cursor-pointer group"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-[15px] font-semibold text-foreground">{app.name}</h3>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    Created {new Date(app.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="rounded-md p-1.5 text-muted-foreground/60 group-hover:text-secondary-foreground group-hover:bg-muted transition-colors">
                  <MoreHorizontal className="h-4 w-4" />
                </div>
              </div>

              {/* Stat Badges */}
              <div className="mt-4 flex flex-wrap gap-1.5">
                <span className="inline-flex items-center rounded-md bg-muted border border-border px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                  {app._count?.appChains ?? 0} Chains
                </span>
                <span className="inline-flex items-center rounded-md bg-muted border border-border px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                  {app._count?.appTokens ?? 0} Tokens
                </span>
                <span className="inline-flex items-center rounded-md bg-muted border border-border px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                  {app._count?.paymentIntents ?? 0} TXs
                </span>
              </div>

              {/* Status */}
              <div className="mt-3 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-xs text-emerald-500 font-medium">
                  {app.environment === 'PRODUCTION' ? 'Production' : 'Test'}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

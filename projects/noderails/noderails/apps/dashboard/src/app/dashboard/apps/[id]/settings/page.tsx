'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { Badge, Button, Card, Input, Spinner, Toggle } from '@/components/ui';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { MerchantWalletConnect } from '@/components/merchant-wallet-connect';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { saveMerchantWalletConfig } from '@/lib/save-merchant-wallet';
import {
  MERCHANT_CHAIN_FAMILY_LABELS,
  type MerchantChainFamily,
} from '@/lib/merchant-wallet-networks';
import { isValidAddress, isValidSuiAddress } from '@noderails/common';
import {
  Settings, Coins, Wallet, Key, Bell,
  Copy, Check, Trash2, Plus, RotateCw, Zap, Activity, Pencil,
  AlertTriangle, ChevronDown, ChevronUp, Link2, RefreshCw, X,
} from 'lucide-react';

type SettingsTab = 'chains' | 'tokens' | 'wallets' | 'api-keys' | 'webhooks';

function settingsTabFromQuery(tab: string | null): SettingsTab | null {
  if (
    tab === 'chains'
    || tab === 'tokens'
    || tab === 'wallets'
    || tab === 'api-keys'
    || tab === 'webhooks'
  ) return tab;
  return null;
}

const tabs: { key: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'chains', label: 'Chains', icon: Link2 },
  { key: 'tokens', label: 'Tokens', icon: Coins },
  { key: 'wallets', label: 'Wallets', icon: Wallet },
  { key: 'api-keys', label: 'API Keys', icon: Key },
  { key: 'webhooks', label: 'Webhooks', icon: Bell },
];

function ChainIcon({ chain }: { chain: { name?: string; iconUrl?: string | null } }) {
  if (chain.iconUrl) {
    return (
      <img
        src={chain.iconUrl}
        alt={`${chain.name ?? 'Chain'} icon`}
        className="h-8 w-8 rounded-md border border-border object-cover"
        loading="lazy"
      />
    );
  }

  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-secondary-foreground">
      {(chain.name ?? 'CH').slice(0, 2).toUpperCase()}
    </div>
  );
}

function TokenIcon({ token }: { token: { symbol?: string; iconUrl?: string | null } }) {
  if (token.iconUrl) {
    return (
      <img
        src={token.iconUrl}
        alt={`${token.symbol ?? 'Token'} icon`}
        className="h-8 w-8 rounded-md border border-border object-cover"
        loading="lazy"
      />
    );
  }

  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-xs font-bold text-primary">
      {token.symbol?.slice(0, 3) ?? 'TOK'}
    </div>
  );
}

export default function AppSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('chains');
  const [appEnvironment, setAppEnvironment] = useState<'TEST' | 'PRODUCTION'>('TEST');

  useEffect(() => {
    const fromUrl = settingsTabFromQuery(searchParams.get('tab'));
    if (fromUrl) setActiveTab(fromUrl);
  }, [searchParams]);

  useEffect(() => {
    if (!token || !id) return;
    api.getApp(token, id).then((app) => {
      if (app?.environment) setAppEnvironment(app.environment);
    }).catch(() => { /* ignore */ });
  }, [token, id]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">App Settings</h1>
        <p className="text-sm text-muted-foreground">Configure chains, tokens, wallets, API keys, and webhooks</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === tab.key
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-secondary-foreground hover:border-border'
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'chains' && <ChainsSection appId={id} token={token} environment={appEnvironment} />}
      {activeTab === 'tokens' && <TokensSection appId={id} token={token} environment={appEnvironment} />}
      {activeTab === 'wallets' && <WalletsSection appId={id} token={token} />}
      {activeTab === 'api-keys' && <ApiKeysSection appId={id} token={token} />}
      {activeTab === 'webhooks' && <WebhooksSection appId={id} token={token} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CHAINS TAB
   ═══════════════════════════════════════════════════════════════════ */

function ChainsSection({ appId, token, environment }: { appId: string; token: string | null; environment: 'TEST' | 'PRODUCTION' }) {
  const [availableChains, setAvailableChains] = useState<any[]>([]);
  const [appChains, setAppChains] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [chains, ac] = await Promise.all([
        api.getAvailableChains(token, environment),
        api.getAppChains(token, appId),
      ]);
      setAvailableChains(Array.isArray(chains) ? chains : []);
      setAppChains(Array.isArray(ac) ? ac : []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [token, appId, environment]);

  useEffect(() => { load(); }, [load]);

  const isEnabled = (chainId: number) =>
    appChains.some((ac) => ac.chainId === chainId && ac.isEnabled);

  const toggle = async (chainId: number, enable: boolean) => {
    if (!token) return;
    setToggling(`chain-${chainId}`);
    try {
      if (enable) await api.enableAppChain(token, appId, String(chainId));
      else await api.disableAppChain(token, appId, String(chainId));
      const updated = await api.getAppChains(token, appId);
      setAppChains(Array.isArray(updated) ? updated : []);
    } catch { /* ignore */ }
    setToggling(null);
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Choose which blockchain networks this app accepts.</p>
      {availableChains.length === 0 ? (
        <p className="text-sm text-muted-foreground">No chains configured yet. Ask your admin to add supported chains.</p>
      ) : (
        <div className="grid gap-3">
          {availableChains.map((chain) => {
            const enabled = isEnabled(chain.chainId);
            const busy = toggling === `chain-${chain.chainId}`;
            const isSol = chain.chainType === 'SOLANA';
            return (
              <div key={chain.chainId} className="rounded-lg border border-border bg-card px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <ChainIcon chain={chain} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{chain.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Chain ID: {chain.chainId}
                        {isSol ? ' · Solana' : ' · EVM'}
                      </p>
                    </div>
                  </div>
                  <Toggle checked={enabled} onChange={(v) => toggle(chain.chainId, v)} disabled={busy} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TOKENS TAB
   ═══════════════════════════════════════════════════════════════════ */

function TokensSection({ appId, token, environment }: { appId: string; token: string | null; environment: 'TEST' | 'PRODUCTION' }) {
  const [availableTokens, setAvailableTokens] = useState<any[]>([]);
  const [appTokens, setAppTokens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [tokens, at] = await Promise.all([
        api.getAvailableTokens(token, environment),
        api.getAppTokens(token, appId),
      ]);
      setAvailableTokens(Array.isArray(tokens) ? tokens : []);
      setAppTokens(Array.isArray(at) ? at : []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [token, appId, environment]);

  useEffect(() => { load(); }, [load]);

  const isEnabled = (tokenId: string) =>
    appTokens.some((at) => (at.supportedTokenId ?? at.token?.id) === tokenId && at.isEnabled);

  const toggle = async (tokenId: string, enable: boolean) => {
    if (!token) return;
    setToggling(`token-${tokenId}`);
    try {
      if (enable) await api.enableAppToken(token, appId, tokenId);
      else await api.disableAppToken(token, appId, tokenId);
      const updated = await api.getAppTokens(token, appId);
      setAppTokens(Array.isArray(updated) ? updated : []);
    } catch { /* ignore */ }
    setToggling(null);
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Choose which tokens this app accepts for payment</p>
      {availableTokens.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tokens configured yet. Ask your admin to add supported tokens.</p>
      ) : (
        <div className="grid gap-2">
          {availableTokens.map((st) => {
            const enabled = isEnabled(st.id);
            const busy = toggling === `token-${st.id}`;
            return (
              <div key={st.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
                <div className="flex items-center gap-3">
                  <TokenIcon token={st} />
                  <div>
                    <p className="text-sm font-medium text-foreground">{st.symbol}</p>
                    <p className="text-xs text-muted-foreground">{st.chain?.name ?? 'Unknown chain'} &middot; {st.decimals} decimals</p>
                  </div>
                </div>
                <Toggle checked={enabled} onChange={(v) => toggle(st.id, v)} disabled={busy} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   WALLETS TAB
   ═══════════════════════════════════════════════════════════════════ */

function WalletsSection({ appId, token }: { appId: string; token: string | null }) {
  const [app, setApp] = useState<any>(null);
  const [appChains, setAppChains] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [showWalletModal, setShowWalletModal] = useState<'receiving' | 'payout' | null>(null);
  const [walletSaving, setWalletSaving] = useState<string | null>(null);
  const [walletErr, setWalletErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [next, chains] = await Promise.all([
        api.getApp(token, appId),
        api.getAppChains(token, appId),
      ]);
      setApp(next);
      setAppChains(Array.isArray(chains) ? chains : []);
    }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, [token, appId]);

  useEffect(() => { load(); }, [load]);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const appEnv: 'TEST' | 'PRODUCTION' =
    app?.environment === 'PRODUCTION' ? 'PRODUCTION' : 'TEST';

  const receivingEvm =
    typeof app?.receivingWallet === 'string' && isValidAddress(app.receivingWallet)
      ? app.receivingWallet
      : null;

  const suiSettlement = appChains.find(
    (r) => r.chain?.chainType === 'SUI' && r.settlementAddress,
  )?.settlementAddress as string | undefined;

  const receivingSui =
    suiSettlement ??
    (typeof app?.receivingWallet === 'string' &&
    isValidSuiAddress(app.receivingWallet) &&
    !isValidAddress(app.receivingWallet)
      ? app.receivingWallet
      : null);

  const solSettlement = appChains.find(
    (r) => r.chain?.chainType === 'SOLANA' && r.settlementAddress,
  )?.settlementAddress as string | undefined;

  const receivingSol =
    solSettlement ??
    (typeof app?.receivingWallet === 'string' &&
    app.receivingWallet.length > 0 &&
    !app.receivingWallet.startsWith('0x')
      ? app.receivingWallet
      : null);

  const payoutEvm =
    typeof app?.payoutWallet === 'string' && isValidAddress(app.payoutWallet)
      ? app.payoutWallet
      : null;

  const payoutSui =
    typeof app?.payoutWallet === 'string' &&
    isValidSuiAddress(app.payoutWallet) &&
    !isValidAddress(app.payoutWallet)
      ? app.payoutWallet
      : null;

  const payoutSol =
    typeof app?.payoutWallet === 'string' &&
    app.payoutWallet.length > 0 &&
    !app.payoutWallet.startsWith('0x')
      ? app.payoutWallet
      : null;

  const openModal = (which: 'receiving' | 'payout') => {
    setWalletErr(null);
    setShowWalletModal(which);
  };

  const receivingHasAny = Boolean(receivingEvm || receivingSol || receivingSui);
  const payoutHasAny = Boolean(payoutEvm || payoutSol || payoutSui);

  const modalHasExisting =
    (showWalletModal === 'receiving' && receivingHasAny) ||
    (showWalletModal === 'payout' && payoutHasAny);

  if (loading) return <Spinner />;
  if (!app) return <p className="text-sm text-muted-foreground">App not found.</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Set where customer payments settle and where payouts are sent. Use Connect wallet to pick a
        network, connect, and sign once per chain.
      </p>

      <WalletGroupCard
        title="Receiving wallet"
        subtitle="Where captured payments settle on each chain"
        addresses={{
          EVM: receivingEvm,
          SOLANA: receivingSol,
          SUI: receivingSui,
        }}
        onConnect={() => openModal('receiving')}
        onCopy={copy}
        copied={copied}
        copyPrefix="recv"
      />

      <WalletGroupCard
        title="Payout wallet"
        subtitle="Where withdrawals and payouts are sent on each chain"
        addresses={{
          EVM: payoutEvm,
          SOLANA: payoutSol,
          SUI: payoutSui,
        }}
        onConnect={() => openModal('payout')}
        onCopy={copy}
        copied={copied}
        copyPrefix="pay"
      />

      <Dialog
        open={showWalletModal !== null}
        onOpenChange={(open) => {
          if (!open) {
            setShowWalletModal(null);
            setWalletErr(null);
          }
        }}
      >
        <DialogContent className="min-w-0 overflow-x-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {showWalletModal === 'receiving' ? 'Connect receiving wallet' : 'Connect payout wallet'}
            </DialogTitle>
            <DialogDescription>
              Choose EVM, Solana, or Sui, connect your wallet, then sign to verify ownership.
            </DialogDescription>
          </DialogHeader>

          {modalHasExisting && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="text-xs text-amber-800">
                <p className="font-medium">You are replacing an existing address</p>
                <p className="mt-0.5">
                  {showWalletModal === 'receiving'
                    ? 'In-flight captures may still use the old address until new payments use this one.'
                    : 'Pending payouts may still use the old wallet until new payouts are created.'}
                </p>
              </div>
            </div>
          )}

          {walletErr && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {walletErr}
            </div>
          )}

          {showWalletModal && (
            <div className="min-w-0 w-full">
              <MerchantWalletConnect
                key={showWalletModal}
                appName={app.name}
                appEnv={appEnv}
                walletType={showWalletModal}
                onVerified={async (family, address, signature) => {
                  if (!token || !showWalletModal) return;
                  setWalletErr(null);
                  setWalletSaving(showWalletModal);
                  try {
                    const updated = await saveMerchantWalletConfig({
                      token,
                      appId,
                      appEnv,
                      walletType: showWalletModal,
                      family,
                      address,
                      signature,
                    });
                    if (updated) setApp(updated);
                    await load();
                    setShowWalletModal(null);
                  } catch (e) {
                    setWalletErr(e instanceof Error ? e.message : 'Failed to save');
                  } finally {
                    setWalletSaving(null);
                  }
                }}
              />
            </div>
          )}

          {walletSaving && (
            <p className="text-xs text-muted-foreground">Saving…</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function truncateWalletAddress(address: string, family: MerchantChainFamily): string {
  if (address.length <= 18) return address;
  if (family === 'EVM') return `${address.slice(0, 6)}…${address.slice(-4)}`;
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function WalletGroupCard({
  title,
  subtitle,
  addresses,
  onConnect,
  onCopy,
  copied,
  copyPrefix,
}: {
  title: string;
  subtitle: string;
  addresses: Record<MerchantChainFamily, string | null>;
  onConnect: () => void;
  onCopy: (text: string, key: string) => void;
  copied: string | null;
  copyPrefix: string;
}) {
  const families: MerchantChainFamily[] = ['EVM', 'SOLANA', 'SUI'];

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <Button type="button" size="sm" onClick={onConnect} className="shrink-0">
          <Wallet className="h-3.5 w-3.5" />
          Connect wallet
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {families.map((family) => {
          const address = addresses[family];
          const copyKey = `${copyPrefix}-${family.toLowerCase()}`;

          return (
            <div
              key={family}
              className="rounded-lg border border-border bg-card px-3 py-2.5"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {MERCHANT_CHAIN_FAMILY_LABELS[family]}
              </p>
              {address ? (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <p
                    className="min-w-0 flex-1 truncate font-mono text-xs text-foreground"
                    title={address}
                  >
                    {truncateWalletAddress(address, family)}
                  </p>
                  <button
                    type="button"
                    onClick={() => onCopy(address, copyKey)}
                    className="shrink-0 rounded-md p-1 hover:bg-muted transition-colors cursor-pointer"
                    title="Copy full address"
                  >
                    {copied === copyKey ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                </div>
              ) : (
                <p className="mt-1.5 text-xs text-muted-foreground">Not set</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   API KEYS TAB
   ═══════════════════════════════════════════════════════════════════ */

function ApiKeysSection({ appId, token }: { appId: string; token: string | null }) {
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyType, setNewKeyType] = useState<'PUBLIC' | 'SECRET'>('SECRET');
  const [creatingKey, setCreatingKey] = useState(false);
  const [justCreatedKey, setJustCreatedKey] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    api.getApiKeys(token, appId)
      .then((keys) => setApiKeys(Array.isArray(keys) ? keys : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, appId]);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleCreate = async () => {
    if (!token) return;
    setCreatingKey(true);
    try {
      const result = await api.createApiKey(token, appId, { name: newKeyName || 'Default', type: newKeyType });
      setJustCreatedKey(result.key);
      setNewKeyName('');
      setShowForm(false);
      const keys = await api.getApiKeys(token, appId);
      setApiKeys(Array.isArray(keys) ? keys : []);
    } catch { /* ignore */ }
    setCreatingKey(false);
  };

  const handleRevoke = async (keyId: string) => {
    if (!token) return;
    try {
      await api.revokeApiKey(token, appId, keyId);
      const keys = await api.getApiKeys(token, appId);
      setApiKeys(Array.isArray(keys) ? keys : []);
    } catch { /* ignore */ }
    setRevokeTarget(null);
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Manage your API keys for this app</p>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Key className="h-3.5 w-3.5" /> New Key
        </Button>
      </div>

      {/* App ID reference */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
          <Key className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">App ID</p>
          <p className="text-sm font-mono text-foreground truncate">{appId}</p>
        </div>
        <button
          onClick={() => copy(appId, 'app-id')}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
          title="Copy App ID"
        >
          {copied === 'app-id' ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>

      {justCreatedKey && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-50 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-emerald-800">API key created successfully!</p>
              <p className="text-xs text-emerald-700 mt-0.5">Copy this key now. You won&apos;t be able to see it again.</p>
            </div>
            <button onClick={() => setJustCreatedKey(null)} className="text-muted-foreground/60 hover:text-secondary-foreground cursor-pointer">&times;</button>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-card border border-border px-4 py-2.5">
            <code className="text-sm font-mono text-foreground flex-1 truncate">{justCreatedKey}</code>
            <button onClick={() => copy(justCreatedKey, 'new-key')} className="shrink-0 rounded-md p-1.5 text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer">
              {copied === 'new-key' ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-3">Create API Key</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Key name" placeholder="My API Key" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} />
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-secondary-foreground">Key type</label>
              <div className="flex gap-2">
                {(['SECRET', 'PUBLIC'] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setNewKeyType(t)}
                    className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                      newKeyType === t ? 'border-primary bg-primary/10 text-primary' : 'border-border text-secondary-foreground hover:bg-muted'
                    }`}>{t === 'SECRET' ? 'Secret' : 'Public'}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" disabled={creatingKey} onClick={handleCreate}>{creatingKey ? 'Creating...' : 'Create Key'}</Button>
          </div>
        </Card>
      )}

      {apiKeys.length === 0 ? (
        <div className="text-center py-12">
          <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-muted mb-3"><Key className="h-5 w-5 text-muted-foreground/60" /></div>
          <p className="text-sm font-medium text-foreground">No API keys</p>
          <p className="text-xs text-muted-foreground mt-1">Create an API key to authenticate requests to this app</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {apiKeys.map((key) => (
            <div key={key.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <Badge variant={key.type === 'SECRET' ? 'default' : 'outline'}>{key.type}</Badge>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{key.name}</p>
                  <p className="text-xs font-mono text-muted-foreground truncate">{key.keyPrefix}...</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!key.active && <Badge variant="destructive">Revoked</Badge>}
                {key.active && (
                  <button onClick={() => setRevokeTarget({ id: key.id, name: key.name })} title="Revoke"
                    className="rounded-md p-1.5 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                <span className="text-[10px] text-muted-foreground/60">{new Date(key.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title="Revoke API Key"
        description={`Revoke API key "${revokeTarget?.name}"? This cannot be undone.`}
        confirmLabel="Revoke"
        onConfirm={() => revokeTarget && handleRevoke(revokeTarget.id)}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   WEBHOOKS TAB
   ═══════════════════════════════════════════════════════════════════ */

const AVAILABLE_EVENTS = [
  'payment.created', 'payment.authorized', 'payment.captured', 'payment.settled',
  'payment.disputed', 'payment.refunded', 'dispute.created', 'dispute.resolved',
  'payout.executed', 'payout.failed',
  'subscription.created', 'subscription.activated', 'subscription.renewed',
  'subscription.payment_failed', 'subscription.past_due', 'subscription.cancelled',
  'subscription.paused', 'subscription.resumed',
];

function WebhooksSection({ appId, token }: { appId: string; token: string | null }) {
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [rotatedSecret, setRotatedSecret] = useState<{ id: string; secret: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [logsOpenId, setLogsOpenId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [deliveriesCursor, setDeliveriesCursor] = useState<string | null>(null);
  const [deliveryFilter, setDeliveryFilter] = useState<string>('');
  const [pingResult, setPingResult] = useState<{ id: string; success: boolean; statusCode: number | null; error: string | null } | null>(null);
  const [pingingId, setPingingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [editEvents, setEditEvents] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete' | 'rotate'; webhookId: string } | null>(null);

  const handleTestPing = async (webhookId: string) => {
    if (!token) return;
    setPingingId(webhookId);
    setPingResult(null);
    try {
      const result = await api.testPingWebhook(token, appId, webhookId);
      setPingResult({ id: webhookId, success: result.success, statusCode: result.statusCode, error: result.error });
    } catch (err) {
      setPingResult({ id: webhookId, success: false, statusCode: null, error: err instanceof Error ? err.message : 'Request failed' });
    } finally {
      setPingingId(null);
    }
  };

  const loadDeliveries = useCallback(async (webhookId: string, filter?: string, cursor?: string) => {
    if (!token) return;
    setDeliveriesLoading(true);
    try {
      const result = await api.getWebhookDeliveries(token, appId, webhookId, {
        status: filter || undefined,
        cursor: cursor || undefined,
        limit: 20,
      });
      if (cursor) {
        setDeliveries((prev) => [...prev, ...result.items]);
      } else {
        setDeliveries(result.items);
      }
      setDeliveriesCursor(result.nextCursor);
    } catch { /* ignore */ }
    finally { setDeliveriesLoading(false); }
  }, [token, appId]);

  const toggleLogs = (webhookId: string) => {
    if (logsOpenId === webhookId) {
      setLogsOpenId(null);
      setDeliveries([]);
      setDeliveriesCursor(null);
      setDeliveryFilter('');
    } else {
      setLogsOpenId(webhookId);
      setDeliveryFilter('');
      loadDeliveries(webhookId);
    }
  };

  const load = useCallback((silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    api.getWebhooks(token, appId)
      .then((data) => setWebhooks(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, appId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!token || !newUrl || selectedEvents.length === 0) return;
    setCreating(true);
    try {
      const result = await api.createWebhook(token, appId, { url: newUrl, events: selectedEvents });
      setCreatedSecret(result.secret);
      setNewUrl('');
      setSelectedEvents([]);
      setShowCreate(false);
      load(true);
    } catch { /* ignore */ }
    finally { setCreating(false); }
  };

  const handleToggleActive = async (wh: any) => {
    if (!token) return;
    try {
      await api.updateWebhook(token, appId, wh.id, { active: !wh.active });
      load(true);
    } catch { /* ignore */ }
  };

  const handleDelete = async (webhookId: string) => {
    if (!token) return;
    try {
      await api.deleteWebhook(token, appId, webhookId);
      setWebhooks((prev) => prev.filter((w) => w.id !== webhookId));
      if (logsOpenId === webhookId) setLogsOpenId(null);
      if (editingId === webhookId) setEditingId(null);
    } catch { /* ignore */ }
    setConfirmAction(null);
  };

  const startEdit = (wh: any) => {
    setEditingId(wh.id);
    setEditUrl(wh.url);
    setEditEvents([...(wh.events as string[])]);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditUrl('');
    setEditEvents([]);
  };

  const handleSaveEdit = async () => {
    if (!token || !editingId) return;
    setSaving(true);
    try {
      await api.updateWebhook(token, appId, editingId, { url: editUrl, events: editEvents });
      cancelEdit();
      load(true);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const toggleEditEvent = (event: string) =>
    setEditEvents((prev) => prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]);

  const handleRotateSecret = async (webhookId: string) => {
    if (!token) return;
    const result = await api.rotateWebhookSecret(token, appId, webhookId);
    setRotatedSecret({ id: webhookId, secret: result.secret });
    setConfirmAction(null);
  };

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleEvent = (event: string) =>
    setSelectedEvents((prev) => prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Receive real-time event notifications at your endpoints</p>
        <button
          onClick={() => { setShowCreate(!showCreate); setCreatedSecret(null); }}
          className="inline-flex items-center gap-2 rounded-lg bg-foreground px-3 py-1.5 text-[13px] font-medium text-white hover:bg-foreground/90 cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" /> Add endpoint
        </button>
      </div>

      {createdSecret && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-green-800">Webhook created! Save this secret. It won&apos;t be shown again.</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 rounded bg-card px-3 py-1.5 font-mono text-xs text-green-900 border border-green-200 break-all">{createdSecret}</code>
                <button onClick={() => copy(createdSecret, 'created')} className="rounded-lg p-1.5 hover:bg-green-100 cursor-pointer">
                  {copiedId === 'created' ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-green-600" />}
                </button>
              </div>
            </div>
            <button onClick={() => setCreatedSecret(null)} className="text-green-400 hover:text-green-600 cursor-pointer"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">New Webhook Endpoint</h3>
          <div>
            <label className="block text-[13px] font-medium text-secondary-foreground mb-1">Endpoint URL</label>
            <input type="url" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://example.com/webhook"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-secondary-foreground mb-2">Events to subscribe</label>
            <div className="grid grid-cols-2 gap-2">
              {AVAILABLE_EVENTS.map((event) => (
                <label key={event} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={selectedEvents.includes(event)} onChange={() => toggleEvent(event)}
                    className="rounded border-border text-primary focus:ring-primary" />
                  <span className="text-sm text-secondary-foreground font-mono">{event}</span>
                </label>
              ))}
            </div>
            <button type="button" onClick={() => setSelectedEvents(selectedEvents.length === AVAILABLE_EVENTS.length ? [] : [...AVAILABLE_EVENTS])}
              className="mt-2 text-xs text-primary hover:underline cursor-pointer">
              {selectedEvents.length === AVAILABLE_EVENTS.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleCreate} disabled={creating || !newUrl || selectedEvents.length === 0}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-40 cursor-pointer">
              {creating ? 'Creating...' : 'Create webhook'}
            </button>
            <button onClick={() => setShowCreate(false)} className="rounded-lg border border-border px-4 py-2 text-sm text-secondary-foreground hover:bg-muted cursor-pointer">Cancel</button>
          </div>
        </div>
      )}

      {webhooks.length === 0 ? (
        <div className="text-center py-12">
          <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-muted mb-3"><Bell className="h-5 w-5 text-muted-foreground/60" /></div>
          <p className="text-sm font-medium text-foreground">No webhook endpoints</p>
          <p className="text-xs text-muted-foreground mt-1">Add an endpoint to start receiving event notifications</p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((wh) => (
            <div key={wh.id} className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${wh.active ? 'bg-green-400' : 'bg-gray-300'}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{wh.url}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{(wh.events as string[])?.length ?? 0} events · Created {new Date(wh.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => handleToggleActive(wh)} className="rounded-lg px-2 py-1 text-xs font-medium hover:bg-muted cursor-pointer">{wh.active ? 'Disable' : 'Enable'}</button>
                  <button onClick={() => handleTestPing(wh.id)} disabled={pingingId === wh.id} title="Send test ping" className="rounded-lg p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-40 cursor-pointer">
                    {pingingId === wh.id ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-primary" /> : <Zap className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => toggleLogs(wh.id)} title="Delivery logs" className={`rounded-lg p-1.5 hover:bg-primary/10 cursor-pointer ${logsOpenId === wh.id ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-primary'}`}>
                    <Activity className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => startEdit(wh)} title="Edit" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setConfirmAction({ type: 'rotate', webhookId: wh.id })} title="Rotate secret" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"><RotateCw className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setConfirmAction({ type: 'delete', webhookId: wh.id })} title="Delete" className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setExpandedId(expandedId === wh.id ? null : wh.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted cursor-pointer">
                    {expandedId === wh.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              {/* Rotated secret banner per-webhook */}
              {rotatedSecret && rotatedSecret.id === wh.id && (
                <div className="border-t border-blue-200 bg-blue-50 px-4 py-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold text-blue-800">New secret. Copy it now, it won&apos;t be shown again.</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <code className="rounded bg-card px-2.5 py-1 font-mono text-xs text-blue-900 border border-blue-200 break-all">{rotatedSecret.secret}</code>
                        <button onClick={() => copy(rotatedSecret.secret, 'rotated')} className="rounded-md p-1 hover:bg-blue-100 cursor-pointer">
                          {copiedId === 'rotated' ? <Check className="h-3.5 w-3.5 text-blue-600" /> : <Copy className="h-3.5 w-3.5 text-blue-600" />}
                        </button>
                      </div>
                    </div>
                    <button onClick={() => setRotatedSecret(null)} className="text-blue-400 hover:text-blue-600 cursor-pointer"><X className="h-4 w-4" /></button>
                  </div>
                </div>
              )}
              {/* Ping result banner */}
              {pingResult && pingResult.id === wh.id && (
                <div className={`border-t px-4 py-2.5 flex items-center justify-between ${
                  pingResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                }`}>
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${pingResult.success ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className={`text-xs font-medium ${pingResult.success ? 'text-green-800' : 'text-red-800'}`}>
                      {pingResult.success
                        ? `Test ping delivered (HTTP ${pingResult.statusCode})`
                        : `Test ping failed${pingResult.statusCode ? ` (HTTP ${pingResult.statusCode})` : ''}`}
                    </span>
                    {pingResult.error && (
                      <span className="text-xs text-red-600">{pingResult.error}</span>
                    )}
                  </div>
                  <button onClick={() => setPingResult(null)} className="text-xs text-muted-foreground hover:text-foreground cursor-pointer">&times;</button>
                </div>
              )}
              {/* Edit webhook panel */}
              {editingId === wh.id && (
                <div className="border-t border-border px-4 py-4 bg-muted/80 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-foreground">Edit Webhook</p>
                    <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground cursor-pointer"><X className="h-4 w-4" /></button>
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium text-secondary-foreground mb-1">Endpoint URL</label>
                    <input type="url" value={editUrl} onChange={(e) => setEditUrl(e.target.value)}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium text-secondary-foreground mb-2">Events</label>
                    <div className="grid grid-cols-2 gap-2">
                      {AVAILABLE_EVENTS.map((event) => (
                        <label key={event} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={editEvents.includes(event)} onChange={() => toggleEditEvent(event)}
                            className="rounded border-border text-primary focus:ring-primary" />
                          <span className="text-sm text-secondary-foreground font-mono">{event}</span>
                        </label>
                      ))}
                    </div>
                    <button type="button" onClick={() => setEditEvents(editEvents.length === AVAILABLE_EVENTS.length ? [] : [...AVAILABLE_EVENTS])}
                      className="mt-2 text-xs text-primary hover:underline cursor-pointer">
                      {editEvents.length === AVAILABLE_EVENTS.length ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleSaveEdit} disabled={saving || !editUrl || editEvents.length === 0}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-40 cursor-pointer">
                      {saving ? 'Saving...' : 'Save changes'}
                    </button>
                    <button onClick={cancelEdit} className="rounded-lg border border-border px-4 py-2 text-sm text-secondary-foreground hover:bg-muted cursor-pointer">Cancel</button>
                  </div>
                </div>
              )}
              {/* Subscribed events expandable */}
              {expandedId === wh.id && editingId !== wh.id && (
                <div className="border-t border-border px-4 py-3 bg-muted">
                  <p className="text-xs font-medium text-secondary-foreground mb-2">Subscribed events</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(wh.events as string[])?.map((event: string) => (
                      <Badge key={event} variant="outline">{event}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {logsOpenId === wh.id && (
                <div className="border-t border-border">
                  <div className="px-4 py-3 bg-muted/80 flex items-center justify-between">
                    <p className="text-xs font-semibold text-foreground">Delivery Logs</p>
                    <div className="flex items-center gap-2">
                      <select
                        value={deliveryFilter}
                        onChange={(e) => { setDeliveryFilter(e.target.value); loadDeliveries(wh.id, e.target.value); }}
                        className="rounded-md border border-border px-2 py-1 text-xs text-secondary-foreground bg-card focus:border-primary focus:outline-none"
                      >
                        <option value="">All statuses</option>
                        <option value="DELIVERED">Delivered</option>
                        <option value="FAILED">Failed</option>
                        <option value="PENDING">Pending</option>
                      </select>
                      <button onClick={() => loadDeliveries(wh.id, deliveryFilter)} title="Refresh" className="rounded-md p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 cursor-pointer">
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {deliveriesLoading && deliveries.length === 0 ? (
                    <div className="px-4 py-6 text-center">
                      <div className="h-5 w-5 mx-auto animate-spin rounded-full border-2 border-border border-t-primary" />
                    </div>
                  ) : deliveries.length === 0 ? (
                    <div className="px-4 py-6 text-center">
                      <p className="text-xs text-muted-foreground">No delivery logs yet</p>
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border bg-muted">
                              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Event</th>
                              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                              <th className="px-4 py-2 text-left font-medium text-muted-foreground">HTTP</th>
                              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Attempts</th>
                              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Created</th>
                              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Delivered</th>
                            </tr>
                          </thead>
                          <tbody>
                            {deliveries.map((d) => (
                              <tr key={d.id} className="border-b border-border/50 hover:bg-muted/80">
                                <td className="px-4 py-2 font-mono text-foreground">{d.event}</td>
                                <td className="px-4 py-2">
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                    d.status === 'DELIVERED' ? 'bg-green-100 text-green-800'
                                    : d.status === 'FAILED' ? 'bg-red-100 text-red-800'
                                    : 'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${
                                      d.status === 'DELIVERED' ? 'bg-green-500'
                                      : d.status === 'FAILED' ? 'bg-red-500'
                                      : 'bg-yellow-500'
                                    }`} />
                                    {d.status}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-secondary-foreground">{d.responseStatus ?? '—'}</td>
                                <td className="px-4 py-2 text-secondary-foreground">{d.attempts}</td>
                                <td className="px-4 py-2 text-muted-foreground">{new Date(d.createdAt).toLocaleString()}</td>
                                <td className="px-4 py-2 text-muted-foreground">{d.deliveredAt ? new Date(d.deliveredAt).toLocaleString() : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {deliveriesCursor && (
                        <div className="px-4 py-3 border-t border-border/50 text-center">
                          <button
                            onClick={() => loadDeliveries(wh.id, deliveryFilter, deliveriesCursor)}
                            disabled={deliveriesLoading}
                            className="text-xs font-medium text-primary hover:underline disabled:opacity-40 cursor-pointer"
                          >
                            {deliveriesLoading ? 'Loading...' : 'Load more'}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={confirmAction?.type === 'delete' ? 'Delete Webhook' : 'Rotate Secret'}
        description={
          confirmAction?.type === 'delete'
            ? 'Delete this webhook endpoint? This cannot be undone.'
            : 'Rotate this webhook secret? The old secret will stop working immediately.'
        }
        confirmLabel={confirmAction?.type === 'delete' ? 'Delete' : 'Rotate'}
        variant={confirmAction?.type === 'delete' ? 'destructive' : 'default'}
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.type === 'delete') handleDelete(confirmAction.webhookId);
          else handleRotateSecret(confirmAction.webhookId);
        }}
      />
    </div>
  );
}
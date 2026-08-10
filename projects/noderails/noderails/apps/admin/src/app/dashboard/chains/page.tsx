'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAdminAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { Card, Table, Badge, Button, Input, Toggle, Spinner, EmptyState } from '@/components/ui';
import { Link2, Plus, Pencil, Trash2, X, Loader2 } from 'lucide-react';

const LEANRPC_API_KEY = 'ak_8166c2e4adfb1fc508ee8d1680f507c4';
const buildLeanRpcUrl = (chainId: number | string) =>
  `https://rpc.leanrpc.xyz/rpc?chainId=${chainId}&apiKey=${LEANRPC_API_KEY}`;
const TRUST_WALLET_BASE =
  'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains';

interface ChainListEntry {
  chainId: number;
  name: string;
  chain: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  explorers?: { name: string; url: string }[];
  testnet?: boolean;
}

// Cache chainlist data so we only fetch once per session
let chainListCache: ChainListEntry[] | null = null;

async function fetchChainInfo(chainId: number): Promise<ChainListEntry | null> {
  try {
    if (!chainListCache) {
      const res = await fetch('https://chainlist.org/rpcs.json');
      if (!res.ok) return null;
      chainListCache = await res.json();
    }
    return chainListCache?.find((c) => c.chainId === chainId) ?? null;
  } catch {
    return null;
  }
}

interface Chain {
  id: string;
  chainId: number;
  chainType?: 'EVM' | 'SOLANA' | 'SUI';
  name: string;
  displayName: string;
  nativeCurrencySymbol: string;
  nativeCurrencyDecimals: number;
  escrowAddress: string;
  merchantManagerAddress: string;
  escrowConfigObjectId?: string | null;
  paymentRegistryObjectId?: string | null;
  walletRegistryObjectId?: string | null;
  merchantManagerConfigObjectId?: string | null;
  mtxmChainDbId?: string | null;
  rpcUrl: string | null;
  explorerUrl: string | null;
  isTestnet: boolean;
  isEnabled: boolean;
  supports7702: boolean;
  iconUrl?: string | null;
}

const NODE_RAILS_SOLANA_CHAIN_IDS = new Set([101, 102, 103]);
const NODE_RAILS_SUI_CHAIN_IDS = new Set([201, 202, 203]);

export default function ChainsPage() {
  const { token } = useAdminAuth();
  const [chains, setChains] = useState<Chain[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingChainId, setEditingChainId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    chainType: 'EVM' as 'EVM' | 'SOLANA' | 'SUI',
    chainId: '',
    name: '',
    displayName: '',
    nativeCurrencySymbol: 'ETH',
    nativeCurrencyDecimals: '18',
    escrowAddress: '',
    merchantManagerAddress: '',
    escrowConfigObjectId: '',
    paymentRegistryObjectId: '',
    walletRegistryObjectId: '',
    merchantManagerConfigObjectId: '',
    mtxmChainDbId: '',
    rpcUrl: '',
    explorerUrl: '',
    iconUrl: '',
    isTestnet: false,
    supports7702: false,
  });
  const [twChainKey, setTwChainKey] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-populate from chainlist.org when chainId changes (debounced 500ms)
  const handleChainIdChange = (value: string) => {
    setFormData((prev) => ({ ...prev, chainId: value }));

    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    const parsed = parseInt(value, 10);
    if (!value || isNaN(parsed) || parsed <= 0) return;

    if (NODE_RAILS_SOLANA_CHAIN_IDS.has(parsed)) {
      lookupTimer.current = setTimeout(() => {
        const label =
          parsed === 101 ? 'Solana Testnet' : parsed === 102 ? 'Solana Devnet' : 'Solana Mainnet';
        setFormData((prev) => ({
          ...prev,
          chainType: 'SOLANA',
          name: prev.name || label,
          displayName: prev.displayName || label,
          nativeCurrencySymbol: 'SOL',
          nativeCurrencyDecimals: '9',
          supports7702: false,
          explorerUrl:
            prev.explorerUrl ||
            (parsed === 103
              ? 'https://solscan.io'
              : `https://solscan.io?cluster=${parsed === 101 ? 'testnet' : 'devnet'}`),
        }));
      }, 300);
      return;
    }

    if (NODE_RAILS_SUI_CHAIN_IDS.has(parsed)) {
      lookupTimer.current = setTimeout(() => {
        const label =
          parsed === 201 ? 'Sui Devnet' : parsed === 202 ? 'Sui Testnet' : 'Sui Mainnet';
        setFormData((prev) => ({
          ...prev,
          chainType: 'SUI',
          name: prev.name || label,
          displayName: prev.displayName || label,
          nativeCurrencySymbol: 'SUI',
          nativeCurrencyDecimals: '9',
          supports7702: false,
          explorerUrl:
            prev.explorerUrl ||
            (parsed === 203
              ? 'https://suiscan.xyz/mainnet'
              : parsed === 202
                ? 'https://suiscan.xyz/testnet'
                : 'https://suiscan.xyz/devnet'),
        }));
      }, 300);
      return;
    }

    lookupTimer.current = setTimeout(async () => {
      setLookingUp(true);
      const info = await fetchChainInfo(parsed);
      if (info) {
        setFormData((prev) => ({
          ...prev,
          name: info.name,
          displayName: info.name,
          nativeCurrencySymbol: info.nativeCurrency.symbol,
          nativeCurrencyDecimals: String(info.nativeCurrency.decimals),
          explorerUrl: info.explorers?.[0]?.url || '',
          rpcUrl: buildLeanRpcUrl(parsed),
          isTestnet: info.testnet ?? false,
        }));
      } else {
        // Chain not found in chainlist — just set RPC URL
        setFormData((prev) => ({
          ...prev,
          rpcUrl: prev.rpcUrl || buildLeanRpcUrl(parsed),
        }));
      }
      setLookingUp(false);
    }, 1000);
  };

  const loadChains = useCallback(async () => {
    if (!token) return;
    try {
      const result = await api.getChains(token);
      setChains(Array.isArray(result) ? result : []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadChains();
  }, [loadChains]);

  const resetForm = () => {
    setFormData({
      chainType: 'EVM',
      chainId: '',
      name: '',
      displayName: '',
      nativeCurrencySymbol: 'ETH',
      nativeCurrencyDecimals: '18',
      escrowAddress: '',
      merchantManagerAddress: '',
      escrowConfigObjectId: '',
      paymentRegistryObjectId: '',
      walletRegistryObjectId: '',
      merchantManagerConfigObjectId: '',
      mtxmChainDbId: '',
      rpcUrl: '',
      explorerUrl: '',
      iconUrl: '',
      isTestnet: false,
      supports7702: false,
    });
    setShowForm(false);
    setEditingId(null);
    setEditingChainId(null);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        chainType: formData.chainType,
        chainId: parseInt(formData.chainId, 10),
        name: formData.name,
        displayName: formData.displayName || formData.name,
        nativeCurrencySymbol: formData.nativeCurrencySymbol,
        nativeCurrencyDecimals: parseInt(formData.nativeCurrencyDecimals, 10),
        escrowAddress: formData.escrowAddress,
        merchantManagerAddress: formData.merchantManagerAddress,
        escrowConfigObjectId: formData.escrowConfigObjectId.trim() || undefined,
        paymentRegistryObjectId: formData.paymentRegistryObjectId.trim() || undefined,
        walletRegistryObjectId: formData.walletRegistryObjectId.trim() || undefined,
        merchantManagerConfigObjectId: formData.merchantManagerConfigObjectId.trim() || undefined,
        mtxmChainDbId: formData.mtxmChainDbId.trim() || undefined,
        rpcUrl:
          formData.rpcUrl.trim() ||
          (formData.chainType === 'SOLANA' || formData.chainType === 'SUI'
            ? undefined
            : buildLeanRpcUrl(formData.chainId)),
        explorerUrl: formData.explorerUrl || undefined,
        iconUrl: formData.iconUrl || undefined,
        isTestnet: formData.isTestnet,
        supports7702:
          formData.chainType === 'SOLANA' || formData.chainType === 'SUI'
            ? false
            : formData.supports7702,
      };
      if (editingId && editingChainId !== null) {
        await api.updateChain(token, String(editingChainId), payload);
      } else {
        await api.createChain(token, payload);
      }
      resetForm();
      await loadChains();
    } catch (err: any) {
      setError(err.message ?? 'Failed to save chain');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (chain: Chain) => {
    setFormData({
      chainType: (chain as Chain).chainType ?? 'EVM',
      chainId: String(chain.chainId),
      name: chain.name,
      displayName: chain.displayName ?? '',
      nativeCurrencySymbol: chain.nativeCurrencySymbol,
      nativeCurrencyDecimals: String(chain.nativeCurrencyDecimals ?? 18),
      escrowAddress: chain.escrowAddress ?? '',
      merchantManagerAddress: chain.merchantManagerAddress ?? '',
      escrowConfigObjectId: chain.escrowConfigObjectId ?? '',
      paymentRegistryObjectId: chain.paymentRegistryObjectId ?? '',
      walletRegistryObjectId: chain.walletRegistryObjectId ?? '',
      merchantManagerConfigObjectId: chain.merchantManagerConfigObjectId ?? '',
      mtxmChainDbId: chain.mtxmChainDbId ?? '',
      rpcUrl: chain.rpcUrl ?? buildLeanRpcUrl(chain.chainId),
      explorerUrl: chain.explorerUrl ?? '',
      iconUrl: chain.iconUrl ?? '',
      isTestnet: chain.isTestnet,
      supports7702: chain.supports7702,
    });
    setTwChainKey('');
    setEditingId(chain.id);
    setEditingChainId(chain.chainId);
    setShowForm(true);
  };

  const autoFillTrustWalletChainIcon = () => {
    const key = twChainKey.trim().toLowerCase();
    if (!key) return;
    setFormData((prev) => ({
      ...prev,
      iconUrl: `${TRUST_WALLET_BASE}/${key}/info/logo.png`,
    }));
  };

  const handleToggleEnabled = async (chain: Chain) => {
    if (!token) return;
    try {
      await api.updateChain(token, String(chain.chainId), { isEnabled: !chain.isEnabled });
      await loadChains();
    } catch (err: any) {
      setError(err.message ?? 'Failed to toggle chain');
    }
  };

  const handleDelete = async (chain: Chain) => {
    if (!token || !confirm(`Delete chain "${chain.name}" (${chain.chainId})?`)) return;
    try {
      await api.deleteChain(token, String(chain.chainId));
      await loadChains();
    } catch (err: any) {
      setError(err.message ?? 'Failed to delete chain');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Supported Chains</h1>
          <p className="mt-1 text-sm text-[#697386]">Manage blockchain networks available on the platform</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="h-4 w-4" /> Add Chain
        </Button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
      )}

      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">{editingId ? 'Edit Chain' : 'New Chain'}</h3>
            <button onClick={resetForm} className="text-[#a3acb9] hover:text-[#425466]">
              <X className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#425466]">Chain type</label>
              <select
                className="w-full rounded-lg border border-[#e3e8ee] bg-white px-3 py-2 text-sm text-[#0a2540]"
                value={formData.chainType}
                onChange={(e) =>
                  setFormData({ ...formData, chainType: e.target.value as 'EVM' | 'SOLANA' | 'SUI' })
                }
                disabled={!!editingId}
              >
                <option value="EVM">EVM</option>
                <option value="SOLANA">Solana</option>
                <option value="SUI">Sui</option>
              </select>
              <p className="mt-1 text-[10px] text-[#697386]">
                Solana: 101/102/103 · Sui: 201 devnet, 202 testnet, 203 mainnet
              </p>
            </div>
            <div>
              <Input
                label="Chain ID"
                type="number"
                placeholder="1"
                value={formData.chainId}
                onChange={(e) => handleChainIdChange(e.target.value)}
                required
                disabled={!!editingId}
              />
              {lookingUp && (
                <p className="mt-1 flex items-center gap-1 text-[10px] text-[#697386]">
                  <Loader2 className="h-3 w-3 animate-spin" /> Looking up chain info…
                </p>
              )}
            </div>
            <Input
              label="Name"
              placeholder="Ethereum Mainnet"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <Input
              label="Display Name"
              placeholder="Ethereum"
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
            />
            <Input
              label="Native Currency Symbol"
              placeholder="ETH"
              value={formData.nativeCurrencySymbol}
              onChange={(e) => setFormData({ ...formData, nativeCurrencySymbol: e.target.value })}
              required
            />
            <Input
              label="Native Currency Decimals"
              type="number"
              value={formData.nativeCurrencyDecimals}
              onChange={(e) => setFormData({ ...formData, nativeCurrencyDecimals: e.target.value })}
            />

            <Input
              label="MTXM chain id (optional)"
              placeholder="MTXM DB id for this network"
              value={formData.mtxmChainDbId}
              onChange={(e) => setFormData({ ...formData, mtxmChainDbId: e.target.value })}
            />

            <div className="sm:col-span-2 border-t border-[#e3e8ee] pt-4 mt-1">
              <p className="text-xs font-semibold text-[#0a2540] mb-3">
                {formData.chainType === 'SOLANA'
                  ? 'Program ids (required)'
                  : formData.chainType === 'SUI'
                    ? 'Package + shared object ids (required)'
                    : 'Contract addresses (required)'}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label={
                    formData.chainType === 'SOLANA'
                      ? 'Escrow program id'
                      : formData.chainType === 'SUI'
                        ? 'Escrow package id'
                        : 'Escrow contract address'
                  }
                  placeholder={
                    formData.chainType === 'SOLANA'
                      ? 'Base58 program id…'
                      : formData.chainType === 'SUI'
                        ? '0x… package id'
                        : '0x…'
                  }
                  value={formData.escrowAddress}
                  onChange={(e) => setFormData({ ...formData, escrowAddress: e.target.value })}
                  required
                />
                <Input
                  label={
                    formData.chainType === 'SOLANA'
                      ? 'Merchant manager program id'
                      : formData.chainType === 'SUI'
                        ? 'Merchant manager package id'
                        : 'Merchant manager contract address'
                  }
                  placeholder={
                    formData.chainType === 'SOLANA'
                      ? 'Base58 program id…'
                      : formData.chainType === 'SUI'
                        ? '0x… package id'
                        : '0x…'
                  }
                  value={formData.merchantManagerAddress}
                  onChange={(e) => setFormData({ ...formData, merchantManagerAddress: e.target.value })}
                  required
                />
                {formData.chainType === 'SUI' && (
                  <>
                    <Input
                      label="Escrow config object id"
                      placeholder="0x…"
                      value={formData.escrowConfigObjectId}
                      onChange={(e) => setFormData({ ...formData, escrowConfigObjectId: e.target.value })}
                      required
                    />
                    <Input
                      label="Payment registry object id"
                      placeholder="0x…"
                      value={formData.paymentRegistryObjectId}
                      onChange={(e) => setFormData({ ...formData, paymentRegistryObjectId: e.target.value })}
                      required
                    />
                    <Input
                      label="Wallet registry object id"
                      placeholder="0x…"
                      value={formData.walletRegistryObjectId}
                      onChange={(e) => setFormData({ ...formData, walletRegistryObjectId: e.target.value })}
                      required
                    />
                    <Input
                      label="Merchant manager config object id"
                      placeholder="0x…"
                      value={formData.merchantManagerConfigObjectId}
                      onChange={(e) =>
                        setFormData({ ...formData, merchantManagerConfigObjectId: e.target.value })
                      }
                      required
                    />
                  </>
                )}
              </div>
            </div>

            <Input
              label="RPC URL"
              placeholder="https://rpc.leanrpc.xyz/rpc?chainId=1&apiKey=..."
              value={formData.rpcUrl}
              onChange={(e) => setFormData({ ...formData, rpcUrl: e.target.value })}
            />
            <Input
              label="Explorer URL"
              placeholder="https://etherscan.io"
              value={formData.explorerUrl}
              onChange={(e) => setFormData({ ...formData, explorerUrl: e.target.value })}
            />
            <div className="sm:col-span-2 rounded-lg border border-[#e3e8ee] bg-[#f6f8fa] p-3">
              <p className="mb-2 text-xs font-semibold text-[#0a2540]">Icon (optional)</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Icon URL"
                  placeholder="https://.../logo.png"
                  value={formData.iconUrl}
                  onChange={(e) => setFormData({ ...formData, iconUrl: e.target.value })}
                />
                <div className="space-y-2">
                  <Input
                    label="TrustWallet chain folder"
                    placeholder="ethereum, base, polygon"
                    value={twChainKey}
                    onChange={(e) => setTwChainKey(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" onClick={autoFillTrustWalletChainIcon}>
                      Use TrustWallet URL
                    </Button>
                    <a
                      href="https://github.com/trustwallet/assets/tree/master/blockchains"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-lg border border-[#e3e8ee] bg-white px-3 py-2 text-xs font-medium text-[#425466] hover:bg-[#f6f8fa]"
                    >
                      Browse Repo
                    </a>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3 justify-center">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isTestnet"
                  checked={formData.isTestnet}
                  onChange={(e) => setFormData({ ...formData, isTestnet: e.target.checked })}
                  className="rounded border-[#e3e8ee]"
                />
                <label htmlFor="isTestnet" className="text-sm text-[#425466]">Testnet</label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="supports7702"
                  checked={formData.supports7702}
                  onChange={(e) => setFormData({ ...formData, supports7702: e.target.checked })}
                  disabled={formData.chainType === 'SOLANA' || formData.chainType === 'SUI'}
                  className="rounded border-[#e3e8ee]"
                />
                <label htmlFor="supports7702" className="text-sm text-[#425466]">
                  Supports EIP-7702
                </label>
              </div>
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={resetForm}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <Spinner />
      ) : chains.length === 0 ? (
        <EmptyState
          title="No chains configured"
          description="Add supported blockchain networks for your platform"
          icon={Link2}
          action={<Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Add Chain</Button>}
        />
      ) : (
        <Table headers={['Chain ID', 'Type', 'Name', 'Contracts', 'Network', 'Enabled', 'Actions']}>
          {chains.map((chain) => (
            <tr key={chain.id} className="hover:bg-[#f6f8fa] transition-colors">
              <td className="px-4 py-3 text-sm font-medium text-[#0a2540]">{chain.chainId}</td>
              <td className="px-4 py-3 text-xs text-[#425466]">{chain.chainType ?? 'EVM'}</td>
              <td className="px-4 py-3 text-sm text-[#425466]">{chain.displayName || chain.name}</td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-[#697386]">Escrow: <code className="text-[#0a2540]">{chain.escrowAddress?.slice(0, 6)}...{chain.escrowAddress?.slice(-4)}</code></span>
                  <span className="text-[10px] text-[#697386]">MM: <code className="text-[#0a2540]">{chain.merchantManagerAddress?.slice(0, 6)}...{chain.merchantManagerAddress?.slice(-4)}</code></span>
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge variant={chain.isTestnet ? 'warning' : 'success'}>
                  {chain.isTestnet ? 'Testnet' : 'Mainnet'}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <Toggle checked={chain.isEnabled} onChange={() => handleToggleEnabled(chain)} />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => startEdit(chain)} className="text-[#a3acb9] hover:text-[#635bff] transition-colors">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDelete(chain)} className="text-[#a3acb9] hover:text-red-600 transition-colors">
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

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAdminAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { Card, Table, Badge, Button, Input, Select, Toggle, Spinner, EmptyState } from '@/components/ui';
import { Coins, Plus, Pencil, Trash2, X } from 'lucide-react';
import { isNativeToken, NATIVE_TOKEN_ADDRESS, SOLANA_NATIVE_TOKEN_SENTINEL, SUI_NATIVE_COIN_TYPE } from '@noderails/common';

const TRUST_WALLET_BASE =
  'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains';

function nativeTokenAddressForChain(chain: Chain | undefined): string {
  if (chain?.chainType === 'SOLANA') return SOLANA_NATIVE_TOKEN_SENTINEL;
  if (chain?.chainType === 'SUI') return SUI_NATIVE_COIN_TYPE;
  return NATIVE_TOKEN_ADDRESS;
}

function defaultNativeDecimals(chain: Chain | undefined): string {
  if (chain?.chainType === 'SOLANA' || chain?.chainType === 'SUI') return '9';
  return '18';
}

interface Token {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  contractAddress: string;
  chainId: number;
  tokenKey: string;
  chain?: { name: string; chainId: number; isEnabled: boolean };
  supportsPermit: boolean;
  supportsNativeTransfer: boolean;
  isStablecoin: boolean;
  isEnabled: boolean;
  iconUrl?: string | null;
}

interface Chain {
  id: string;
  chainId: number;
  name: string;
  isEnabled: boolean;
  chainType?: 'EVM' | 'SOLANA' | 'SUI';
}

export default function TokensPage() {
  const { token } = useAdminAuth();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [chains, setChains] = useState<Chain[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    symbol: '',
    name: '',
    decimals: '18',
    contractAddress: '',
    chainId: '',
    isStablecoin: false,
    supportsPermit: false,
    supportsNativeTransfer: true,
    isNative: false,
    iconUrl: '',
  });
  const [twChainKey, setTwChainKey] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const [tokenResult, chainResult] = await Promise.all([
        api.getTokens(token),
        api.getChains(token),
      ]);
      setTokens(Array.isArray(tokenResult) ? tokenResult : tokenResult.items ?? []);
      setChains(Array.isArray(chainResult) ? chainResult : []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetForm = () => {
    setFormData({
      symbol: '',
      name: '',
      decimals: '18',
      contractAddress: '',
      chainId: '',
      isStablecoin: false,
      supportsPermit: false,
      supportsNativeTransfer: true,
      isNative: false,
      iconUrl: '',
    });
    setShowForm(false);
    setEditingId(null);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError('');
    setSubmitting(true);
    try {
      const selectedChain = chains.find((c) => c.id === formData.chainId || String(c.chainId) === formData.chainId);
      const numericChainId = selectedChain?.chainId ?? parseInt(formData.chainId, 10);
      const contractAddress = formData.isNative
        ? nativeTokenAddressForChain(selectedChain)
        : formData.contractAddress.trim();

      const payload = {
        symbol: formData.symbol,
        name: formData.name,
        decimals: parseInt(formData.decimals, 10),
        contractAddress,
        chainId: numericChainId,
        isStablecoin: formData.isStablecoin,
        supportsPermit: formData.supportsPermit,
        supportsNativeTransfer: formData.supportsNativeTransfer,
        iconUrl: formData.iconUrl || undefined,
      };
      if (editingId) {
        await api.updateToken(token, editingId, payload);
      } else {
        await api.createToken(token, payload);
      }
      resetForm();
      await loadData();
    } catch (err: any) {
      setError(err.message ?? 'Failed to save token');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (t: Token) => {
    const chain = chains.find((c) => c.chainId === t.chainId);
    setFormData({
      symbol: t.symbol,
      name: t.name,
      decimals: String(t.decimals),
      contractAddress: t.contractAddress,
      chainId: chain?.id ?? String(t.chainId),
      isStablecoin: t.isStablecoin,
      supportsPermit: t.supportsPermit,
      supportsNativeTransfer: t.supportsNativeTransfer,
      isNative: isNativeToken(t.contractAddress),
      iconUrl: t.iconUrl ?? '',
    });
    setEditingId(t.id);
    setShowForm(true);
  };

  const autoFillTrustWalletTokenIcon = () => {
    const key = twChainKey.trim().toLowerCase();
    if (!key) return;

    if (formData.isNative) {
      setFormData((prev) => ({ ...prev, iconUrl: `${TRUST_WALLET_BASE}/${key}/info/logo.png` }));
      return;
    }

    const address = formData.contractAddress.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      setError('Enter a valid token contract address before auto-filling TrustWallet icon URL');
      return;
    }

    setFormData((prev) => ({
      ...prev,
      iconUrl: `${TRUST_WALLET_BASE}/${key}/assets/${address}/logo.png`,
    }));
  };

  const isChainDisabled = (t: Token) => {
    // Check from token's own chain relation first (most accurate)
    if (t.chain && 'isEnabled' in t.chain) return !t.chain.isEnabled;
    // Fallback to chains list
    const chain = chains.find((c) => c.chainId === t.chainId);
    return chain ? !chain.isEnabled : false;
  };

  const handleToggleEnabled = async (t: Token) => {
    if (!token) return;
    if (isChainDisabled(t)) {
      setError(`Cannot modify token — chain "${t.chain?.name ?? t.chainId}" is disabled. Enable the chain first.`);
      return;
    }
    try {
      await api.updateToken(token, t.id, { isEnabled: !t.isEnabled });
      await loadData();
    } catch (err: any) {
      setError(err.message ?? 'Failed to toggle token');
    }
  };

  const handleDelete = async (tokenId: string) => {
    if (!token || !confirm('Delete this token?')) return;
    try {
      await api.deleteToken(token, tokenId);
      await loadData();
    } catch (err: any) {
      setError(err.message ?? 'Failed to delete token');
    }
  };

  const chainOptions = [
    { value: '', label: 'Select chain' },
    ...chains.map((c) => ({ value: c.id, label: `${c.name} (${c.chainId})` })),
  ];

  const trustWalletPreviewUrl = (() => {
    const key = twChainKey.trim().toLowerCase();
    if (!key) return '';
    if (formData.isNative) return `${TRUST_WALLET_BASE}/${key}/info/logo.png`;
    const address = formData.contractAddress.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return '';
    return `${TRUST_WALLET_BASE}/${key}/assets/${address}/logo.png`;
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Supported Tokens</h1>
          <p className="mt-1 text-sm text-[#697386]">Manage tokens available for payments across chains</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="h-4 w-4" /> Add Token
        </Button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
      )}

      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">{editingId ? 'Edit Token' : 'New Token'}</h3>
            <button onClick={resetForm} className="text-[#a3acb9] hover:text-[#425466]">
              <X className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Symbol"
              placeholder="USDC"
              value={formData.symbol}
              onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
              required
            />
            <Input
              label="Name"
              placeholder="USD Coin"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <Input
              label="Decimals"
              type="number"
              value={formData.decimals}
              onChange={(e) => setFormData({ ...formData, decimals: e.target.value })}
              required
            />
            <Select
              label="Chain"
              options={chainOptions}
              value={formData.chainId}
              onChange={(e) => {
                const chainId = e.target.value;
                const ch = chains.find((c) => c.id === chainId);
                setFormData((prev) => ({
                  ...prev,
                  chainId,
                  contractAddress: prev.isNative ? nativeTokenAddressForChain(ch) : prev.contractAddress,
                  decimals: prev.isNative ? defaultNativeDecimals(ch) : prev.decimals,
                }));
              }}
              required
            />
            <div className="sm:col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  id="isNative"
                  checked={formData.isNative}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    const ch = chains.find((c) => c.id === formData.chainId || String(c.chainId) === formData.chainId);
                    setFormData({
                      ...formData,
                      isNative: checked,
                      contractAddress: checked ? nativeTokenAddressForChain(ch) : '',
                      supportsPermit: checked ? false : formData.supportsPermit,
                      decimals: checked ? defaultNativeDecimals(ch) : formData.decimals,
                    });
                  }}
                  className="rounded border-[#e3e8ee]"
                />
                <label htmlFor="isNative" className="text-sm font-medium text-[#0a2540]">
                  Native token (ETH, MATIC, SOL, …)
                </label>
              </div>
              {formData.isNative && (
                <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700 space-y-2">
                  {chains.find((c) => c.id === formData.chainId)?.chainType === 'SOLANA' ? (
                    <p>
                      Native SOL uses the default-pubkey sentinel (<code className="font-mono break-all">{SOLANA_NATIVE_TOKEN_SENTINEL}</code>
                      ); lamports transfers do not use an SPL mint.
                    </p>
                  ) : chains.find((c) => c.id === formData.chainId)?.chainType === 'SUI' ? (
                    <p>
                      Native SUI uses coin type <code className="font-mono">{SUI_NATIVE_COIN_TYPE}</code>.
                    </p>
                  ) : (
                    <p>
                      EVM native tokens are sent via <code className="font-mono">msg.value</code> — no ERC-20 contract. The zero address (
                      <code className="font-mono">0x000…0</code>) is stored.
                    </p>
                  )}
                </div>
              )}
            </div>
            {!formData.isNative && (
              <Input
                label="Contract Address"
                placeholder={
                  chains.find((c) => c.id === formData.chainId)?.chainType === 'SUI'
                    ? '0x2::sui::SUI or 0xPACKAGE::module::COIN'
                    : chains.find((c) => c.id === formData.chainId)?.chainType === 'SOLANA'
                      ? 'Base58 mint address…'
                      : '0x…'
                }
                value={formData.contractAddress}
                onChange={(e) => setFormData({ ...formData, contractAddress: e.target.value })}
                required
              />
            )}
            {formData.symbol && formData.chainId && (
              <div className="rounded-lg bg-[#f6f8fa] border border-[#e3e8ee] px-3 py-2 flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#697386]">SDK Token Key:</span>
                <code className="text-xs font-mono font-semibold text-[#635bff]">
                  {formData.symbol.toUpperCase()}-{chains.find((c) => c.id === formData.chainId)?.chainId ?? formData.chainId}
                </code>
              </div>
            )}
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
                  <p className="text-[11px] text-[#697386]">
                    {formData.isNative
                      ? 'Native token URL pattern: /<chain>/info/logo.png'
                      : 'ERC20 token URL pattern: /<chain>/assets/<contractAddress>/logo.png'}
                  </p>
                  {trustWalletPreviewUrl && (
                    <p className="text-[11px] text-[#425466] break-all">
                      Preview: <code>{trustWalletPreviewUrl}</code>
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" onClick={autoFillTrustWalletTokenIcon}>
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
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isStablecoin"
                  checked={formData.isStablecoin}
                  onChange={(e) => setFormData({ ...formData, isStablecoin: e.target.checked })}
                  className="rounded border-[#e3e8ee]"
                />
                <label htmlFor="isStablecoin" className="text-sm text-[#425466]">Stablecoin</label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="supportsPermit"
                  checked={formData.supportsPermit}
                  onChange={(e) => setFormData({ ...formData, supportsPermit: e.target.checked })}
                  className="rounded border-[#e3e8ee]"
                />
                <label htmlFor="supportsPermit" className="text-sm text-[#425466]">Supports Permit (EIP-2612)</label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="supportsNativeTransfer"
                  checked={formData.supportsNativeTransfer}
                  onChange={(e) => setFormData({ ...formData, supportsNativeTransfer: e.target.checked })}
                  className="rounded border-[#e3e8ee]"
                />
                <label htmlFor="supportsNativeTransfer" className="text-sm text-[#425466]">Supports Native Transfer</label>
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
      ) : tokens.length === 0 ? (
        <EmptyState
          title="No tokens configured"
          description="Add tokens that merchants can accept for payments"
          icon={Coins}
          action={<Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Add Token</Button>}
        />
      ) : (
        <Table headers={['Token Key', 'Symbol', 'Name', 'Chain', 'Type', 'Enabled', 'Actions']}>
          {tokens.map((t) => {
            const chainDisabled = isChainDisabled(t);
            return (
              <tr key={t.id} className={chainDisabled ? 'opacity-50 bg-[#f6f8fa]' : 'hover:bg-[#f6f8fa] transition-colors'}>
                <td className="px-4 py-3">
                  <code className="rounded bg-[#f0f2f5] px-1.5 py-0.5 text-xs font-mono font-semibold text-[#635bff]">
                    {t.tokenKey}
                  </code>
                </td>
                <td className="px-4 py-3 text-sm font-medium text-[#0a2540]">{t.symbol}</td>
                <td className="px-4 py-3 text-sm text-[#425466]">{t.name}</td>
                <td className="px-4 py-3 text-sm text-[#425466]">
                  <div className="flex items-center gap-1.5">
                    {t.chain?.name ?? `Chain ${t.chainId}`}
                    {chainDisabled && <Badge variant="destructive">Chain Disabled</Badge>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {isNativeToken(t.contractAddress) && <Badge variant="warning">Native</Badge>}
                    {t.isStablecoin && <Badge variant="success">Stable</Badge>}
                    {t.supportsPermit && <Badge variant="default">Permit</Badge>}
                    {!isNativeToken(t.contractAddress) && !t.isStablecoin && !t.supportsPermit && <Badge variant="outline">Standard</Badge>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {chainDisabled ? (
                    <span className="text-xs text-[#df1b41]">Enable chain first</span>
                  ) : (
                    <Toggle checked={t.isEnabled} onChange={() => handleToggleEnabled(t)} />
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => !chainDisabled && startEdit(t)}
                      className={chainDisabled ? 'text-[#d1d8e0] cursor-not-allowed' : 'text-[#a3acb9] hover:text-[#635bff] transition-colors'}
                      disabled={chainDisabled}
                      title={chainDisabled ? 'Enable chain first' : 'Edit'}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => !chainDisabled && handleDelete(t.id)}
                      className={chainDisabled ? 'text-[#d1d8e0] cursor-not-allowed' : 'text-[#a3acb9] hover:text-red-600 transition-colors'}
                      disabled={chainDisabled}
                      title={chainDisabled ? 'Enable chain first' : 'Delete'}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}

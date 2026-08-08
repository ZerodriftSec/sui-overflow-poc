'use client';

import { useEffect, useMemo, useState } from 'react';

interface SupportedChain {
  chainId: number;
  displayName: string;
  nativeCurrencySymbol: string;
  isTestnet: boolean;
  iconUrl: string | null;
}

interface SupportedToken {
  id: string;
  tokenKey: string;
  symbol: string;
  name: string;
  chainId: number;
  chainName: string;
  isTestnet: boolean;
  isStablecoin: boolean;
  iconUrl: string | null;
}

interface SupportedAssetsResponse {
  chains: SupportedChain[];
  tokens: SupportedToken[];
  updatedAt: string;
}

interface CuratedChain {
  chainId: number;
  displayName: string;
  nativeCurrencySymbol: string;
  isTestnet: boolean;
  iconUrl: string | null;
  isUpcoming?: boolean;
}

const CURATED_CHAINS: CuratedChain[] = [
  {
    chainId: 1,
    displayName: 'Ethereum',
    nativeCurrencySymbol: 'ETH',
    isTestnet: false,
    iconUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
  },
  {
    chainId: 137,
    displayName: 'Polygon',
    nativeCurrencySymbol: 'POL',
    isTestnet: false,
    iconUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png',
  },
  {
    chainId: 42161,
    displayName: 'Arbitrum',
    nativeCurrencySymbol: 'ETH',
    isTestnet: false,
    iconUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png',
  },
  {
    chainId: 10,
    displayName: 'Optimism',
    nativeCurrencySymbol: 'ETH',
    isTestnet: false,
    iconUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png',
  },
  {
    chainId: 103,
    displayName: 'Solana',
    nativeCurrencySymbol: 'SOL',
    isTestnet: false,
    iconUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',
  },
  {
    chainId: 102,
    displayName: 'Solana Devnet',
    nativeCurrencySymbol: 'SOL',
    isTestnet: true,
    iconUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',
  },
  {
    chainId: 202,
    displayName: 'Sui Testnet',
    nativeCurrencySymbol: 'SUI',
    isTestnet: true,
    iconUrl: 'https://cryptologos.cc/logos/sui-sui-logo.svg?v=040',
  },
  {
    chainId: 203,
    displayName: 'Sui Mainnet',
    nativeCurrencySymbol: 'SUI',
    isTestnet: false,
    iconUrl: 'https://cryptologos.cc/logos/sui-sui-logo.svg?v=040',
  },
  {
    chainId: 101,
    displayName: 'Solana Testnet',
    nativeCurrencySymbol: 'SOL',
    isTestnet: true,
    iconUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',
  },
  {
    chainId: 10143,
    displayName: 'Monad',
    nativeCurrencySymbol: 'MON',
    isTestnet: false,
    iconUrl: null,
    isUpcoming: true,
  },
  {
    chainId: 11155111,
    displayName: 'Sepolia',
    nativeCurrencySymbol: 'ETH',
    isTestnet: true,
    iconUrl: null,
  },
  {
    chainId: 84532,
    displayName: 'Base Sepolia',
    nativeCurrencySymbol: 'ETH',
    isTestnet: true,
    iconUrl: null,
  },
  {
    chainId: 421614,
    displayName: 'Arbitrum Sepolia',
    nativeCurrencySymbol: 'ETH',
    isTestnet: true,
    iconUrl: null,
  },
];

function IconFallback({ label }: { label: string }) {
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 999,
        background: 'linear-gradient(135deg, #eef2ff, #dbeafe)',
        border: '1px solid #c7d2fe',
        color: '#3730a3',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 700,
      }}
      aria-hidden
    >
      {label.slice(0, 2).toUpperCase()}
    </div>
  );
}

function AssetIcon({ src, alt, fallback }: { src: string | null; alt: string; fallback: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <IconFallback label={fallback} />;
  return (
    <img
      src={src}
      alt={alt}
      width={36}
      height={36}
      style={{ width: 36, height: 36, borderRadius: 999, border: '1px solid #e2e8f0', objectFit: 'cover' }}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}

export function SupportedAssetsSection() {
  const [data, setData] = useState<SupportedAssetsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        const res = await fetch('/api/public/supported-assets', { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load supported assets');
        if (mounted) setData(json.data ?? json);
      } catch (err: unknown) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load supported assets');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const { productionChains, testChains } = useMemo(() => {
    const apiChains = data?.chains ?? [];
    const seen = new Set(apiChains.map((chain) => chain.displayName.trim().toLowerCase()));

    const merged = [...apiChains];
    for (const curated of CURATED_CHAINS) {
      const key = curated.displayName.trim().toLowerCase();
      if (!seen.has(key)) {
        merged.push(curated);
      }
    }

    return {
      productionChains: merged.filter((chain) => !chain.isTestnet),
      testChains: merged.filter((chain) => chain.isTestnet),
    };
  }, [data]);

  return (
    <section
      style={{
        marginTop: 24,
        marginBottom: 24,
        borderRadius: 16,
        border: '1px solid #e2e8f0',
        background:
          'radial-gradient(900px 280px at -10% -30%, rgba(99,102,241,0.08), transparent 55%), radial-gradient(700px 220px at 110% 130%, rgba(14,165,233,0.08), transparent 60%), #ffffff',
        padding: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Supported Chains and Tokens</h2>
        {data?.updatedAt && (
          <span style={{ fontSize: 12, color: '#64748b' }}>
            Currently available
          </span>
        )}
      </div>
      <p style={{ marginTop: 8, color: '#475569' }}>
        Explore the chains and tokens currently available for payments.
      </p>

      {loading && <p style={{ color: '#64748b' }}>Loading supported assets...</p>}
      {error && <p style={{ color: '#b91c1c' }}>Could not load supported assets: {error}</p>}

      {!loading && !error && data && (
        <>
          <div style={{ marginTop: 14 }}>
            <h3 style={{ marginBottom: 10 }}>Production Chains ({productionChains.length})</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {productionChains.map((chain) => (
                <div
                  key={`${chain.displayName}-${chain.chainId}`}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    backgroundColor: '#fff',
                    padding: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <AssetIcon src={chain.iconUrl} alt={`${chain.displayName} icon`} fallback={chain.nativeCurrencySymbol} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{chain.displayName}</span>
                      {Boolean((chain as CuratedChain).isUpcoming) && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: '#9a3412',
                            backgroundColor: '#ffedd5',
                            border: '1px solid #fdba74',
                            borderRadius: 999,
                            padding: '1px 6px',
                          }}
                        >
                          REQUEST
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      {chain.nativeCurrencySymbol}
                      {` · Chain ID ${chain.chainId}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <h3 style={{ marginBottom: 10 }}>Test Chains ({testChains.length})</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {testChains.map((chain) => (
                <div
                  key={`${chain.displayName}-${chain.chainId}`}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    backgroundColor: '#fff',
                    padding: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <AssetIcon src={chain.iconUrl} alt={`${chain.displayName} icon`} fallback={chain.nativeCurrencySymbol} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{chain.displayName}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      {chain.nativeCurrencySymbol}
                      {` · Chain ID ${chain.chainId}`}
                      {' · Testnet'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </>
      )}
    </section>
  );
}

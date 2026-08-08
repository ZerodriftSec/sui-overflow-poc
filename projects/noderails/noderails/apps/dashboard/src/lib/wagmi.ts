import { coinbaseWallet, injected, walletConnect } from 'wagmi/connectors';
import { createConfig, http, type CreateConnectorFn } from 'wagmi';
import { mainnet, sepolia, polygon, arbitrum, optimism, base } from 'wagmi/chains';
import { defineChain, type Chain } from 'viem';
import {
  getLeanRpcUrl,
  getSolanaPublicRpcUrl,
  NODE_RAILS_SOLANA_CHAIN_IDS,
  NODE_RAILS_SUI_CHAIN_IDS,
} from '@noderails/common';

export interface WagmiChainInput {
  chainId: number;
  name: string;
  displayName?: string;
  nativeCurrencySymbol: string;
  isTestnet: boolean;
  chainType?: 'EVM' | 'SOLANA' | 'SUI';
  rpcUrl?: string | null;
}

function leanRpc(chainId: number) {
  return http(getLeanRpcUrl(chainId));
}

function toWagmiChain(chain: WagmiChainInput) {
  return defineChain({
    id: chain.chainId,
    name: chain.displayName ?? chain.name,
    nativeCurrency: {
      name: chain.nativeCurrencySymbol,
      symbol: chain.nativeCurrencySymbol,
      decimals: 18,
    },
    rpcUrls: {
      default: { http: [getLeanRpcUrl(chain.chainId)] },
      public: { http: [getLeanRpcUrl(chain.chainId)] },
    },
    testnet: chain.isTestnet,
  });
}

function isSolanaChainInput(chain: WagmiChainInput): boolean {
  if (chain.chainType === 'SOLANA') return true;
  if (chain.chainType === 'SUI') return false;
  return NODE_RAILS_SOLANA_CHAIN_IDS.has(chain.chainId);
}

function isSuiChainInput(chain: WagmiChainInput): boolean {
  if (chain.chainType === 'SUI') return true;
  return NODE_RAILS_SUI_CHAIN_IDS.has(chain.chainId);
}

export function evmChainInputs(chainInputs: WagmiChainInput[]): WagmiChainInput[] {
  return chainInputs.filter((c) => !isSolanaChainInput(c) && !isSuiChainInput(c));
}

function buildChains(chainInputs: WagmiChainInput[]) {
  const evmOnly = evmChainInputs(chainInputs);
  return evmOnly.length > 0
    ? evmOnly.map(toWagmiChain)
    : [mainnet, sepolia, polygon, arbitrum, optimism, base];
}

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WC_PROJECT_ID?.trim() ||
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() ||
  '';

function buildConnectors(): CreateConnectorFn[] {
  const connectors: CreateConnectorFn[] = [injected({ shimDisconnect: true })];
  if (walletConnectProjectId) {
    connectors.push(
      walletConnect({
        projectId: walletConnectProjectId,
        showQrModal: true,
      }) as CreateConnectorFn,
    );
  }
  connectors.push(
    coinbaseWallet({
      appName: 'NodeRails Dashboard',
    }) as CreateConnectorFn,
  );
  return connectors;
}

export function buildWagmiConfig(chainInputs: WagmiChainInput[]) {
  const chains = buildChains(chainInputs) as unknown as [Chain, ...Chain[]];

  return createConfig({
    chains,
    connectors: buildConnectors(),
    transports: Object.fromEntries(chains.map((chain) => [chain.id, leanRpc(chain.id)])),
    ssr: true,
  });
}

export function solanaClusterForChainId(chainId: number): 'mainnet' | 'devnet' | 'testnet' {
  if (chainId === 101) return 'testnet';
  if (chainId === 103) return 'mainnet';
  return 'devnet';
}

export function buildSatelliteSolanaRpcUrls(
  chainInputs: WagmiChainInput[],
): Partial<Record<'mainnet' | 'devnet' | 'testnet', string>> {
  const rpcUrls: Partial<Record<'mainnet' | 'devnet' | 'testnet', string>> = {
    devnet: 'https://api.devnet.solana.com',
    mainnet: 'https://api.mainnet-beta.solana.com',
    testnet: 'https://api.testnet.solana.com',
  };

  for (const chain of chainInputs) {
    if (!isSolanaChainInput(chain)) continue;
    const url = chain.rpcUrl?.trim() || getSolanaPublicRpcUrl(chain.chainId);
    if (!url) continue;
    rpcUrls[solanaClusterForChainId(chain.chainId)] = url;
  }

  return rpcUrls;
}

import { getFullnodeUrl } from '@mysten/sui/client';

const SUI_CHAIN_RPC: Record<number, string> = {
  201: getFullnodeUrl('devnet'),
  202: getFullnodeUrl('testnet'),
  203: getFullnodeUrl('mainnet'),
};

/**
 * Browser-safe Sui JSON-RPC URL. Public fullnodes block cross-origin requests,
 * so production checkout uses a same-origin Next.js proxy route.
 */
export function resolveSuiBrowserRpcUrl(
  chainId: number,
  configuredRpcUrl?: string | null,
): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/sui/rpc?chainId=${chainId}`;
  }
  return configuredRpcUrl?.trim() || SUI_CHAIN_RPC[chainId] || getFullnodeUrl('devnet');
}

export function resolveSuiUpstreamRpcUrl(chainId: number): string {
  return SUI_CHAIN_RPC[chainId] || getFullnodeUrl('devnet');
}

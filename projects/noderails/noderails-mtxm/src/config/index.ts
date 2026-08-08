export interface MtxmConfig {
  port: number;
  bindHost: string;
  apiToken: string | undefined;
  defaultSignerId: string;
  defaultSignerPubkeyB64: string;
  suiDevnetRpc: string;
  suiTestnetRpc: string;
  suiMainnetRpc: string;
}

export function loadConfig(): MtxmConfig {
  const port = Number.parseInt(process.env.MTXM_PORT?.trim() ?? '8790', 10);
  return {
    port: Number.isFinite(port) ? port : 8790,
    bindHost: process.env.MTXM_BIND_HOST?.trim() || '127.0.0.1',
    apiToken: process.env.MTXM_API_TOKEN?.trim() || undefined,
    defaultSignerId: process.env.MTXM_DEFAULT_SIGNER_ID?.trim() || 'platform-signer-01',
    defaultSignerPubkeyB64:
      process.env.MTXM_DEFAULT_SIGNER_PUBKEY_B64?.trim() ||
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    suiDevnetRpc: process.env.SUI_DEVNET_RPC?.trim() || 'https://fullnode.devnet.sui.io:443',
    suiTestnetRpc: process.env.SUI_TESTNET_RPC?.trim() || 'https://fullnode.testnet.sui.io:443',
    suiMainnetRpc: process.env.SUI_MAINNET_RPC?.trim() || 'https://fullnode.mainnet.sui.io:443',
  };
}

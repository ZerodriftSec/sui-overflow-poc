export function loadConfig() {
  const port = Number.parseInt(process.env.INDEXER_PORT?.trim() ?? '8791', 10);
  return {
    port: Number.isFinite(port) ? port : 8791,
    bindHost: process.env.INDEXER_BIND_HOST?.trim() || '127.0.0.1',
    suiChainId: Number.parseInt(process.env.SUI_CHAIN_ID?.trim() ?? '202', 10),
    suiRpcUrl: process.env.SUI_RPC_URL?.trim() || 'https://fullnode.testnet.sui.io:443',
    escrowPackageId:
      process.env.ESCROW_PACKAGE_ID?.trim() || '0xYOUR_ESCROW_PACKAGE_ID',
    pollIntervalMs: Number.parseInt(process.env.POLL_INTERVAL_MS?.trim() ?? '12000', 10),
    webhookSigningSecret:
      process.env.INDEXER_WEBHOOK_SECRET?.trim() || 'whsec_submission_placeholder_rotate_in_prod',
  };
}

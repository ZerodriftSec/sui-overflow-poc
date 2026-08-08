import { NodeRails } from '@noderails/sdk';

let client: NodeRails | null = null;

/** NodeRails client using the published npm package `@noderails/sdk` (not monorepo code). */
export function getNodeRails(): NodeRails {
  if (!client) {
    const appId = process.env.NODERAILS_APP_ID;
    const apiKey = process.env.NODERAILS_API_KEY;

    if (!appId || !apiKey) {
      throw new Error('Set NODERAILS_APP_ID and NODERAILS_API_KEY in demo/buy-me-coffee/.env.local');
    }

    client = new NodeRails({
      appId,
      apiKey,
      baseUrl: process.env.NODERAILS_API_URL ?? 'http://localhost:8080',
    });
  }

  return client;
}

export function getPaymentUiBase(): string {
  return (process.env.PAYMENT_UI_URL ?? 'http://localhost:3002').replace(/\/$/, '');
}

export function getAppBase(): string {
  return (process.env.APP_BASE_URL ?? 'http://localhost:3005').replace(/\/$/, '');
}

export function checkoutUrl(sessionId: string): string {
  return `${getPaymentUiBase()}/checkout/${sessionId}`;
}

export function paymentLinkUrl(slug: string): string {
  return `${getPaymentUiBase()}/link/${slug}`;
}

export function uniqueSlug(prefix: string): string {
  const safe = prefix
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  return `${safe || 'coffee'}-${Date.now().toString(36)}`;
}

export function formatAmount(amount: string): string {
  const n = Number.parseFloat(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('Amount must be a positive number');
  }
  return n.toFixed(2);
}

/** NodeRails Sui chain id: 201 devnet, 202 testnet, 203 mainnet. */
export function getSuiChainId(): number {
  const raw = process.env.NODERAILS_SUI_CHAIN_ID?.trim() || '202';
  const chainId = Number.parseInt(raw, 10);
  if (!Number.isFinite(chainId)) {
    throw new Error('NODERAILS_SUI_CHAIN_ID must be a number (201, 202, or 203)');
  }
  return chainId;
}

/** Restrict checkout / payment links to Sui + configured token keys. */
export function getSuiPaymentConstraints(): { allowedChains: number[]; allowedTokens: string[]; chainId: number } {
  const chainId = getSuiChainId();
  const tokensEnv = process.env.NODERAILS_ALLOWED_TOKENS?.trim();
  const allowedTokens = tokensEnv
    ? tokensEnv.split(',').map((t) => t.trim()).filter(Boolean)
    : [`SUI-${chainId}`, `USDC-${chainId}`];

  return {
    chainId,
    allowedChains: [chainId],
    allowedTokens,
  };
}

export function getWebhookUrl(): string {
  return `${getAppBase()}/api/webhooks/noderails`;
}

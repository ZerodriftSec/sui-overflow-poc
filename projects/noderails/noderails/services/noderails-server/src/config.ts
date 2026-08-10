/**
 * Unified server configuration.
 * All env vars in one place — easy to find, easy to change.
 */
export const env = {
  // ── Server ──
  NODE_ENV: (process.env.NODE_ENV ?? 'development') as 'development' | 'test' | 'production',
  PORT: Number(process.env.PORT ?? 3000),
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:3001,http://localhost:3002,http://localhost:3003,http://localhost:3004',
  LOG_LEVEL: (process.env.LOG_LEVEL ?? 'info') as 'debug' | 'info' | 'warn' | 'error',

  // ── Database ──
  DATABASE_URL: process.env.DATABASE_URL ?? '',

  // ── Auth ──
  JWT_SECRET: process.env.JWT_SECRET ?? 'change-me-in-production',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'change-me-refresh-secret',

  // ── Platform Admin (env-based credentials) ──
  ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? '',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? '',

  // ── MTXM ──
  MTXM_BASE_URL: process.env.MTXM_BASE_URL ?? 'http://localhost:8080',
  MTXM_PROJECT_ID: process.env.MTXM_PROJECT_ID ?? '',
  MTXM_API_KEY: process.env.MTXM_API_KEY ?? '',
  MTXM_WEBHOOK_SECRET: process.env.MTXM_WEBHOOK_SECRET ?? '',
  /** Solana public key of the MTXM-managed signer used for settle / refund / dispute (single-signer txs). */
  MTXM_SOLANA_SIGNER_PUBKEY: process.env.MTXM_SOLANA_SIGNER_PUBKEY ?? '',
  /**
   * MTXM signer **database id** (dashboard / Signers API). Required for SPL `capture_spl` submits that use
   * `solana.transactionBase64` because the Ed25519 program ix has no accounts and MTXM rejects `instructions[]`
   * when `keys` is empty.
   */
  MTXM_SOLANA_SIGNER_ID: process.env.MTXM_SOLANA_SIGNER_ID?.trim() ?? '',
  /**
   * Per-tx compute unit limit passed to MTXM for Solana *program* submissions.
   * Solana clamps the whole transaction to **1.4M CUs** (devnet / mainnet / local validator).
   * Values in env above that are pointless; if a program needs more, reduce on-chain CU usage or split the flow.
   */
  MTXM_SOLANA_CU_LIMIT: (() => {
    const raw = process.env.MTXM_SOLANA_CU_LIMIT?.replace(/_/g, '').trim();
    const protocolMax = 1_400_000;
    const defaultCu = protocolMax;
    if (raw === undefined || raw === '') return defaultCu;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) return defaultCu;
    return Math.min(Math.floor(n), protocolMax);
  })(),
  /** Optional priority fee for MTXM-submitted Solana program txs (micro-lamports per CU). */
  MTXM_SOLANA_CU_PRICE_MICRO_LAMPORTS: (() => {
    const raw = process.env.MTXM_SOLANA_CU_PRICE_MICRO_LAMPORTS;
    if (raw === undefined || raw === '') return undefined as number | undefined;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return Math.floor(n);
  })(),
  /** Optional override: Sui address of the MTXM-managed signer (otherwise from allocate API). */
  MTXM_SUI_SIGNER_PUBKEY: process.env.MTXM_SUI_SIGNER_PUBKEY ?? '',
  /** Optional override: MTXM signer database id for Sui PTB submissions. */
  MTXM_SUI_SIGNER_ID: process.env.MTXM_SUI_SIGNER_ID?.trim() ?? '',
  /** Optional override: base64-encoded 32-byte Ed25519 public key for on-chain auth verify. */
  MTXM_SUI_ED25519_PUBKEY_BASE64: process.env.MTXM_SUI_ED25519_PUBKEY_BASE64?.trim() ?? '',

  /** Optional dedicated Sui testnet JSON-RPC (avoids public fullnode 429 during PTB build). */
  SUI_TESTNET_RPC_URL: process.env.SUI_TESTNET_RPC_URL?.trim() ?? '',

  // ── Indexer ──
  INDEXER_WEBHOOK_SECRET: process.env.INDEXER_WEBHOOK_SECRET ?? '',

  // ── Redis ──
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',

  // ── Payment UI ──
  DASHBOARD_URL:
    process.env.DASHBOARD_URL
    ?? process.env.NEXT_PUBLIC_DASHBOARD_URL
    ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001'),
  PAYMENT_UI_URL: process.env.PAYMENT_UI_URL || 'http://localhost:3002',

  // ── CryptoCompare ──
  CRYPTOCOMPARE_API_KEY: process.env.CRYPTOCOMPARE_API_KEY ?? '',

  // ── AWS (shared credentials used by SES and S3) ──
  AWS_REGION: process.env.AWS_REGION ?? 'us-east-1',
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? '',
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? '',

  // ── AWS SES (Email) ──
  SES_FROM_EMAIL: process.env.SES_FROM_EMAIL ?? 'no-reply@noderails.com',
  SES_SQS_QUEUE_URL: process.env.SES_SQS_QUEUE_URL ?? '',

  // ── AWS S3 (File uploads) ──
  S3_UPLOADS_BUCKET: process.env.S3_UPLOADS_BUCKET ?? 'noderails-uploads',

  // ── Dev / Test ──
  ENABLE_TEST_INTERVALS: process.env.ENABLE_TEST_INTERVALS === 'true',
  ENABLE_TEST_TIMELOCKS: process.env.ENABLE_TEST_TIMELOCKS === 'true',
} as const;

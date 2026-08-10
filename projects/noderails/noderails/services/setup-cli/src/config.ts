/**
 * Setup CLI configuration.
 *
 * All values come from environment variables.  The CLI validates
 * them up-front so every step can assume they exist.
 */

export interface SetupConfig {
  // ── MTXM ──
  mtxmBaseUrl: string;
  mtxmProjectId: string;
  mtxmApiKey: string;

  // ── Indexer ──
  indexerBaseUrl: string;
  indexerApiKey: string;

  // ── NodeRails webhook endpoints (where MTXM / Indexer POST to) ──
  /** e.g. https://payment.noderails.internal/webhooks/mtxm */
  mtxmWebhookUrl: string;
  /** e.g. https://payment.noderails.internal/webhooks/indexer */
  indexerWebhookUrl: string;

  // ── Contracts ──
  /** Path to the NodeRailsEscrow ABI JSON file */
  escrowAbiPath: string;
}

const REQUIRED_ENV_VARS: Array<[keyof SetupConfig, string]> = [
  ['mtxmBaseUrl', 'MTXM_BASE_URL'],
  ['mtxmProjectId', 'MTXM_PROJECT_ID'],
  ['mtxmApiKey', 'MTXM_API_KEY'],
  ['indexerBaseUrl', 'INDEXER_BASE_URL'],
  ['indexerApiKey', 'INDEXER_API_KEY'],
  ['mtxmWebhookUrl', 'NODERAILS_MTXM_WEBHOOK_URL'],
  ['indexerWebhookUrl', 'NODERAILS_INDEXER_WEBHOOK_URL'],
  ['escrowAbiPath', 'ESCROW_ABI_PATH'],
];

export function loadConfig(): SetupConfig {
  const missing: string[] = [];
  const cfg: Record<string, string> = {};

  for (const [key, envVar] of REQUIRED_ENV_VARS) {
    const val = process.env[envVar];
    if (!val) {
      missing.push(envVar);
    } else {
      cfg[key] = val;
    }
  }

  if (missing.length > 0) {
    console.error('❌  Missing required environment variables:');
    for (const v of missing) console.error(`   - ${v}`);
    process.exit(1);
  }

  return cfg as unknown as SetupConfig;
}

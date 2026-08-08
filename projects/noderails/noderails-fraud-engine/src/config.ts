/**
 * Environment configuration. Loads from process.env (use `node --env-file=.env`).
 */

export interface AppConfig {
  goldrushApiKey: string;
  /** GoldRush chain name, for example sui-mainnet, sui-testnet, or solana-mainnet */
  chainName: string;
  quoteCurrency: string;
}

export interface ServerConfig extends AppConfig {
  port: number;
  bindHost: string;
  /** When set, clients must send Authorization: Bearer <token> on protected routes (not /health). */
  apiToken: string | undefined;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v.trim();
}

export function loadConfig(): AppConfig {
  return {
    goldrushApiKey: requireEnv('GOLDRUSH_API_KEY'),
    chainName: process.env['GOLDRUSH_CHAIN_NAME']?.trim() ?? 'sui-mainnet',
    quoteCurrency: process.env['QUOTE_CURRENCY']?.trim() ?? 'USD',
  };
}

export function loadServerConfig(): ServerConfig {
  const base = loadConfig();
  const portRaw = process.env['PORT']?.trim();
  const port = portRaw ? Number.parseInt(portRaw, 10) : 8788;
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a number between 1 and 65535');
  }
  const bindHost = process.env['BIND_HOST']?.trim() || '127.0.0.1';
  const apiTokenRaw = process.env['FRAUD_ENGINE_API_TOKEN']?.trim();
  return {
    ...base,
    port,
    bindHost,
    apiToken: apiTokenRaw || undefined,
  };
}

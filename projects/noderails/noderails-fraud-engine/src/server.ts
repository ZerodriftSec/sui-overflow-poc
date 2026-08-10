/**
 * NodeRails Fraud Engine HTTP API.
 * Uses Node.js built-in `http` only (no Express dependency).
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { assessWalletReport } from './assess.js';
import { loadServerConfig } from './config.js';
import { HttpError } from './server/http-error.js';
import { readJsonBody } from './server/read-body.js';
import { getServiceVersion } from './server/version.js';
import { isValidSolanaAddressString } from './validation/solana-address.js';
import { isValidSuiAddressString } from './validation/sui-address.js';

const SERVICE_ID = 'noderails-fraud-engine';

function json(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'X-Service-Id': SERVICE_ID,
    'X-Service-Version': getServiceVersion(),
    ...extraHeaders,
  });
  res.end(payload);
}

function setCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

function checkAuth(req: IncomingMessage, expectedToken: string | undefined): void {
  if (!expectedToken) return;
  const h = req.headers.authorization;
  const prefix = 'Bearer ';
  const token = h?.startsWith(prefix) ? h.slice(prefix.length).trim() : undefined;
  if (token !== expectedToken) {
    throw new HttpError('Unauthorized', 401, 'UNAUTHORIZED');
  }
}

function parsePath(url: string): { pathname: string; searchParams: URLSearchParams } {
  const base = 'http://127.0.0.1';
  const u = new URL(url, base);
  return { pathname: u.pathname.replace(/\/+$/, '') || '/', searchParams: u.searchParams };
}

const startedAt = Date.now();

export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: ReturnType<typeof loadServerConfig>,
): Promise<void> {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  const url = req.url ?? '/';
  const { pathname } = parsePath(url);

  try {
    if (req.method === 'GET' && pathname === '/health') {
      json(res, 200, {
        status: 'ok',
        service: SERVICE_ID,
        version: getServiceVersion(),
        uptime_ms: Date.now() - startedAt,
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/status') {
      checkAuth(req, config.apiToken);
      json(res, 200, {
        service: SERVICE_ID,
        version: getServiceVersion(),
        chain_name: config.chainName,
        quote_currency: config.quoteCurrency,
        goldrush_configured: Boolean(config.goldrushApiKey),
        goldrush_api_host: 'https://api.covalenthq.com',
        capabilities: [
          'sui_wallet_assessment',
          'solana_wallet_assessment',
          'goldrush_balances_v2',
          'goldrush_transactions_v3',
          'goldrush_transactions_summary',
          'goldrush_recent_tx_pagination_merge',
        ],
      });
      return;
    }

    if (req.method === 'GET' && pathname.match(/^\/v1\/sui\/wallets\/[^/]+\/assessment$/)) {
      checkAuth(req, config.apiToken);
      const parts = pathname.split('/').filter(Boolean);
      const rawAddr = parts[3];
      const address = rawAddr ? decodeURIComponent(rawAddr) : '';
      if (!address || !isValidSuiAddressString(address)) {
        throw new HttpError('Invalid Sui wallet address in path', 400, 'INVALID_ADDRESS');
      }
      const report = await assessWalletReport({ walletAddress: address });
      json(res, 200, { success: true, data: report });
      return;
    }

    if (req.method === 'POST' && pathname === '/v1/sui/wallets/assess') {
      checkAuth(req, config.apiToken);
      if (!req.headers['content-type']?.includes('application/json')) {
        throw new HttpError('Content-Type must be application/json', 415, 'UNSUPPORTED_MEDIA_TYPE');
      }
      const body = await readJsonBody(req);
      const addr =
        body &&
        typeof body === 'object' &&
        'address' in body &&
        typeof (body as { address?: unknown }).address === 'string'
          ? (body as { address: string }).address
          : undefined;
      if (!addr?.trim()) {
        throw new HttpError('JSON body must include string field "address"', 400, 'VALIDATION_ERROR');
      }
      if (!isValidSuiAddressString(addr)) {
        throw new HttpError('Invalid Sui wallet address', 400, 'INVALID_ADDRESS');
      }
      const report = await assessWalletReport({ walletAddress: addr.trim() });
      json(res, 200, { success: true, data: report });
      return;
    }

    if (req.method === 'GET' && pathname.match(/^\/v1\/solana\/wallets\/[^/]+\/assessment$/)) {
      checkAuth(req, config.apiToken);
      const parts = pathname.split('/').filter(Boolean);
      const rawAddr = parts[3];
      const address = rawAddr ? decodeURIComponent(rawAddr) : '';
      if (!address || !isValidSolanaAddressString(address)) {
        throw new HttpError('Invalid Solana wallet address in path', 400, 'INVALID_ADDRESS');
      }
      const report = await assessWalletReport({ walletAddress: address });
      json(res, 200, { success: true, data: report });
      return;
    }

    if (req.method === 'POST' && pathname === '/v1/solana/wallets/assess') {
      checkAuth(req, config.apiToken);
      if (!req.headers['content-type']?.includes('application/json')) {
        throw new HttpError('Content-Type must be application/json', 415, 'UNSUPPORTED_MEDIA_TYPE');
      }
      const body = await readJsonBody(req);
      const addr =
        body &&
        typeof body === 'object' &&
        'address' in body &&
        typeof (body as { address?: unknown }).address === 'string'
          ? (body as { address: string }).address
          : undefined;
      if (!addr?.trim()) {
        throw new HttpError('JSON body must include string field "address"', 400, 'VALIDATION_ERROR');
      }
      if (!isValidSolanaAddressString(addr)) {
        throw new HttpError('Invalid Solana wallet address', 400, 'INVALID_ADDRESS');
      }
      const report = await assessWalletReport({ walletAddress: addr.trim() });
      json(res, 200, { success: true, data: report });
      return;
    }

    json(res, 404, {
      success: false,
      error: { code: 'NOT_FOUND', message: 'No route matches this method and path.' },
    });
  } catch (err) {
    if (err instanceof HttpError) {
      json(res, err.statusCode, {
        success: false,
        error: { code: err.code, message: err.message },
      });
      return;
    }
    const message = err instanceof Error ? err.message : 'Internal error';
    json(res, 500, {
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    });
  }
}

export function startServer(): void {
  const config = loadServerConfig();
  const server = createServer((req, res) => {
    void handleRequest(req, res, config);
  });

  server.listen(config.port, config.bindHost, () => {
    process.stderr.write(
      `${SERVICE_ID} ${getServiceVersion()} listening on http://${config.bindHost}:${config.port}\n`,
    );
  });
}

startServer();

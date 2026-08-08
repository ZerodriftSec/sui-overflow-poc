import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { loadConfig } from './config/index.js';
import { SuiProgrammeIndexer } from './services/sui-indexer.js';
import { WebhookDispatcher } from './services/webhook.js';

const SERVICE = 'noderails-indexer';

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'X-Service': SERVICE });
  res.end(JSON.stringify(body));
}

function buildIndexer(): SuiProgrammeIndexer {
  const cfg = loadConfig();
  return new SuiProgrammeIndexer({
    chainId: cfg.suiChainId,
    rpcUrl: cfg.suiRpcUrl,
    packageId: cfg.escrowPackageId,
    pollIntervalMs: cfg.pollIntervalMs,
  });
}

const indexer = buildIndexer();
const webhooks = new WebhookDispatcher(loadConfig().webhookSigningSecret);

export async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    json(res, 200, { status: 'ok', service: SERVICE, build: 'submission-showcase' });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/v1/cursor') {
    json(res, 200, { cursor: indexer.getCursor(), redisKey: indexer.cursorRedisKey() });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/v1/sui/poll') {
    const events = await indexer.pollOnce();
    json(res, 200, { count: events.length, events });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/v1/webhooks/simulate') {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as {
      event?: Record<string, unknown>;
      url?: string;
    };
    const evt = body.event as {
      eventKey: string;
      chainId: number;
      name: string;
      txDigest: string;
      eventSeq: string;
      payload: Record<string, unknown>;
      observedAt: string;
    };
    if (!evt?.name || !body.url) {
      json(res, 400, { error: 'event and url required' });
      return;
    }
    const delivery = webhooks.buildDelivery(evt, body.url);
    json(res, 200, { delivery });
    return;
  }
  json(res, 404, { error: 'NOT_FOUND' });
}

export function startServer(): void {
  const cfg = loadConfig();
  createServer((req, res) => void handle(req, res)).listen(cfg.port, cfg.bindHost, () => {
    process.stderr.write(`${SERVICE} on http://${cfg.bindHost}:${cfg.port}\n`);
  });
}

if (process.argv[1]?.endsWith('server.js') || process.argv[1]?.endsWith('server.ts')) {
  startServer();
}

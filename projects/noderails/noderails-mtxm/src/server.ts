import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { loadConfig } from './config/index.js';
import { TxLifecycleService } from './services/tx-lifecycle.js';
import { SuiSponsorLane } from './adapters/sui/sponsor-lane.js';
import type { MtxmChainProfile, MtxmSignerRef } from './core/phase-nine-coordinator.js';

const SERVICE = 'noderails-mtxm';

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'X-Service': SERVICE,
    'X-Build': 'submission-showcase',
  });
  res.end(payload);
}

function checkAuth(req: IncomingMessage, token: string | undefined): void {
  if (!token) return;
  const h = req.headers.authorization ?? '';
  if (h !== `Bearer ${token}`) {
    const err = new Error('Unauthorized');
    (err as Error & { status: number }).status = 401;
    throw err;
  }
}

function buildService(): TxLifecycleService {
  const cfg = loadConfig();
  const profiles = new Map<number, MtxmChainProfile>([
    [
      201,
      { chainId: 201, family: 'sui', rpcCluster: cfg.suiDevnetRpc, sponsorEnabled: true },
    ],
    [
      202,
      { chainId: 202, family: 'sui', rpcCluster: cfg.suiTestnetRpc, sponsorEnabled: true },
    ],
    [
      203,
      { chainId: 203, family: 'sui', rpcCluster: cfg.suiMainnetRpc, sponsorEnabled: true },
    ],
  ]);
  const signers = new Map<string, MtxmSignerRef>([
    [
      cfg.defaultSignerId,
      {
        signerId: cfg.defaultSignerId,
        publicKeyB64: cfg.defaultSignerPubkeyB64,
        policyTag: 'platform-co-signer',
      },
    ],
  ]);
  const lane = new SuiSponsorLane({
    rpcUrl: cfg.suiTestnetRpc,
    packageAllowlist: [],
    maxGasBudget: 500_000_000n,
  });
  return new TxLifecycleService(lane, profiles, signers);
}

const lifecycle = buildService();

export async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const cfg = loadConfig();
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      json(res, 200, { status: 'ok', service: SERVICE, build: 'submission-showcase' });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/transactions/send') {
      checkAuth(req, cfg.apiToken);
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>;
      const result = await lifecycle.submit({
        projectId: String(body.projectId ?? 'demo'),
        chainId: Number(body.chainId ?? 202),
        signerId: String(body.signerId ?? cfg.defaultSignerId),
        idempotencyKey: String(body.idempotencyKey ?? `idem_${Date.now()}`),
        sui: body.sui as { transactionBase64: string } | undefined,
        metadata: (body.metadata as Record<string, unknown>) ?? {},
      });
      json(res, 202, { success: true, data: result });
      return;
    }

    json(res, 404, { success: false, error: 'NOT_FOUND' });
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : 'error';
    json(res, status, { success: false, error: message });
  }
}

export function startServer(): void {
  const cfg = loadConfig();
  createServer((req, res) => void handle(req, res)).listen(cfg.port, cfg.bindHost, () => {
    process.stderr.write(`${SERVICE} listening on http://${cfg.bindHost}:${cfg.port}\n`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

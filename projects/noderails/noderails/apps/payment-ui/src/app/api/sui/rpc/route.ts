import { NextRequest, NextResponse } from 'next/server';
import { resolveSuiUpstreamRpcUrl } from '../../../../lib/sui-rpc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_CHAIN_IDS = new Set([201, 202, 203]);

type JsonRpcRequest = {
  jsonrpc?: string;
  method?: string;
  params?: unknown;
  id?: unknown;
};

function isJsonRpcCall(value: unknown): value is JsonRpcRequest & { method: string } {
  if (typeof value !== 'object' || value === null) return false;
  const method = (value as JsonRpcRequest).method;
  return typeof method === 'string' && method.trim().length > 0;
}

function normalizePayload(body: unknown): JsonRpcRequest | JsonRpcRequest[] | null {
  if (isJsonRpcCall(body)) {
    return body;
  }
  if (Array.isArray(body) && body.length > 0 && body.every(isJsonRpcCall)) {
    return body;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const chainIdRaw = req.nextUrl.searchParams.get('chainId');
  const chainId = chainIdRaw ? Number(chainIdRaw) : NaN;
  if (!Number.isInteger(chainId) || !ALLOWED_CHAIN_IDS.has(chainId)) {
    return NextResponse.json({ error: 'Invalid chainId' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const payload = normalizePayload(body);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid JSON-RPC request' }, { status: 400 });
  }

  const upstream = resolveSuiUpstreamRpcUrl(chainId);
  const upstreamRes = await fetch(upstream, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const text = await upstreamRes.text();
  return new NextResponse(text, {
    status: upstreamRes.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

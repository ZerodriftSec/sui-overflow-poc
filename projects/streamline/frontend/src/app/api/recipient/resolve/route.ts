import { NextResponse } from "next/server";
import { SuiClient } from "@mysten/sui/client";

import { FULLNODE_URLS, type NetworkName } from "@/lib/constants";
import { resolveRecipient } from "@/lib/suins";

export const runtime = "nodejs";

const cache = new Map<string, { until: number; body: unknown }>();
const TTL_MS = 30_000;

function networkFrom(raw: string | null): NetworkName {
  if (raw === "mainnet" || raw === "testnet" || raw === "devnet") return raw;
  return "testnet";
}

/**
 * GET /api/recipient/resolve?q=alice&network=testnet
 * Resolves a handle / SuiNS name / hex address to a Sui address.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const network = networkFrom(url.searchParams.get("network"));

  if (!q) {
    return NextResponse.json({ error: "missing_q" }, { status: 400 });
  }

  const key = `${network}:${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) {
    return NextResponse.json(hit.body);
  }

  const client = new SuiClient({ url: FULLNODE_URLS[network] });
  try {
    const resolved = await resolveRecipient(client, q);
    if (!resolved) {
      return NextResponse.json({ error: "not_found", q }, { status: 404 });
    }
    const body = {
      address: resolved.address,
      displayName: resolved.displayName,
      handle: resolved.handle,
      q,
      network,
    };
    cache.set(key, { until: Date.now() + TTL_MS, body });
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json(
      {
        error: "resolve_failed",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 502 }
    );
  }
}

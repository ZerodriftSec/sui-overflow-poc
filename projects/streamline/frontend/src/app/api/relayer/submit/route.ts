import { NextResponse } from "next/server";

import {
  buildRelayerTx,
  rateLimit,
  relayerAddress,
  relayerEnabled,
  relayerKeypair,
  suiClient,
  type RelayerSubmitBody,
} from "@/lib/relayer-server";

export const runtime = "nodejs";

/**
 * Privacy relayer submitter. Rebuilds allowlisted PTBs server-side and signs as
 * the relayer so the chain sees the relayer as tx sender (origin hiding).
 *
 * POST { network, kind, ...structured fields } → { digest }
 */
export async function POST(req: Request) {
  if (!relayerEnabled()) {
    return NextResponse.json({ error: "relayer_disabled" }, { status: 501 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (!rateLimit(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const keypair = relayerKeypair();
  const sender = relayerAddress();
  if (!keypair || !sender) {
    return NextResponse.json({ error: "relayer_disabled" }, { status: 501 });
  }

  let body: RelayerSubmitBody;
  try {
    body = (await req.json()) as RelayerSubmitBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const network = body.network ?? "testnet";
  if (network !== "testnet" && network !== "mainnet" && network !== "devnet") {
    return NextResponse.json({ error: "invalid_network" }, { status: 400 });
  }

  try {
    const tx = buildRelayerTx(body, sender);
    const client = suiClient(network);
    const res = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true },
    });
    if (res.effects?.status.status !== "success") {
      return NextResponse.json(
        { error: res.effects?.status.error || "relayer_reverted" },
        { status: 502 }
      );
    }
    return NextResponse.json({ digest: res.digest, sender });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "relayer_failed";
    const status =
      msg.startsWith("missing_") ||
      msg.startsWith("invalid_") ||
      msg === "unsupported_kind"
        ? 400
        : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}

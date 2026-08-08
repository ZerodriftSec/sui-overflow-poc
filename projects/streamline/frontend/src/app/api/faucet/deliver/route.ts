import { NextResponse } from "next/server";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";

import { TEST_USDC } from "@/lib/constants";

export const runtime = "nodejs";

/**
 * Testnet-only "delivery" leg of the mock on-ramp: our keeper mints test USDC
 * and transfers it to the buyer's Sui address — no user signature, so a "buy"
 * ends with USDC landing in the wallet on our behalf. Mainnet uses a real ramp
 * instead; this route never runs there (it mints the mock coin only).
 *
 * POST { address, amount } → { digest }
 *
 * ponytail: reuses the keeper key already used for SuiNS minting. Not a real
 * purchase — testnet demo funds with no value.
 */

const MAX_AMOUNT = 10_000; // cap the faucet per call
const SUI_ADDR = /^0x[0-9a-fA-F]{64}$/;

function keeperKey(): string {
  return process.env.SUINS_ADMIN_SECRET_KEY?.trim() || "";
}

export async function POST(req: Request) {
  const secret = keeperKey();
  if (!secret) {
    return NextResponse.json({ error: "keeper_not_configured" }, { status: 501 });
  }

  let body: { address?: string; amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const address = body.address?.trim();
  const amount = Number(body.amount);
  if (!address || !SUI_ADDR.test(address)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }

  const amountBase = BigInt(Math.round(amount * 1_000_000)); // USDC = 6 decimals
  const rpc =
    process.env.NEXT_PUBLIC_SUI_TESTNET_RPC?.trim() || getFullnodeUrl("testnet");
  const client = new SuiClient({ url: rpc });
  const keypair = Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(secret).secretKey);

  const tx = new Transaction();
  const coin = tx.moveCall({
    target: `${TEST_USDC.packageId}::mock_usdc::mint`,
    arguments: [tx.object(TEST_USDC.treasuryId), tx.pure.u64(amountBase)],
  });
  tx.transferObjects([coin], tx.pure.address(address));

  try {
    const res = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true },
    });
    if (res.effects?.status.status !== "success") {
      return NextResponse.json(
        { error: res.effects?.status.error || "delivery_reverted" },
        { status: 502 }
      );
    }
    return NextResponse.json({ digest: res.digest });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "delivery_failed" },
      { status: 502 }
    );
  }
}

import { NextResponse } from "next/server";

import { relayerAddress, relayerEnabled } from "@/lib/relayer-server";

export const runtime = "nodejs";

/**
 * Privacy relayer status.
 * GET → { enabled, address } — address is where users send USDC for two-step deposit.
 */
export async function GET() {
  const enabled = relayerEnabled();
  const address = enabled ? relayerAddress() : null;
  return NextResponse.json({ enabled, address });
}

import { NextResponse } from "next/server";

import { allowedMoveCallTargets } from "@/lib/enoki-targets";
import type { NetworkName } from "@/lib/constants";

/**
 * Enoki sponsorship proxy. Holds the **secret** Enoki key server-side and calls
 * the Enoki REST API directly (no SDK import — keeps us off the Enoki↔Sui-v2
 * dependency that forced the zkLogin no-op). The browser never sees the key.
 *
 *   GET  /api/sponsor          → { enabled }   (is a sponsor key configured?)
 *   POST /api/sponsor          → { bytes, digest }   (sponsor a tx kind)
 *   POST /api/sponsor/execute  → { digest }          (submit the signed tx)
 */

const ENOKI_API = "https://api.enoki.mystenlabs.com/v1";

function apiKey() {
  return process.env.ENOKI_PRIVATE_API_KEY?.trim() || "";
}

export async function GET() {
  return NextResponse.json({ enabled: !!apiKey() });
}

type SponsorBody = {
  network?: NetworkName;
  sender?: string;
  /** base64 transaction *kind* bytes (built with onlyTransactionKind: true). */
  transactionKindBytes?: string;
  /**
   * The StreamLine package the client built its move calls against. Passed so
   * the server allow-lists that exact package — server-side env can otherwise
   * resolve a different (stale) package than the browser used.
   */
  packageId?: string;
  /**
   * Extra addresses this sponsored tx may send objects to — e.g. a wallet
   * transfer's chosen recipient. The sender is always allowed. Validated to
   * real Sui addresses and capped so a client can't widen the allow-list
   * arbitrarily (only gas is ever at risk here — the user still signs).
   */
  allowedRecipients?: string[];
};

const SUI_ADDR = /^0x[0-9a-fA-F]{64}$/;

export async function POST(req: Request) {
  const key = apiKey();
  if (!key) {
    return NextResponse.json({ error: "sponsorship_disabled" }, { status: 501 });
  }

  let body: SponsorBody;
  try {
    body = (await req.json()) as SponsorBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { network, sender, transactionKindBytes, allowedRecipients, packageId } = body;
  if (!network || !sender || !transactionKindBytes) {
    return NextResponse.json(
      { error: "missing_fields", required: ["network", "sender", "transactionKindBytes"] },
      { status: 400 }
    );
  }

  // Sender is always allowed; extra recipients must be real Sui addresses and
  // are capped so a client can't turn the sponsor into an open relay.
  const recipients = Array.isArray(allowedRecipients)
    ? allowedRecipients.filter((a) => typeof a === "string" && SUI_ADDR.test(a)).slice(0, 8)
    : [];
  const allowedAddresses = Array.from(new Set([sender, ...recipients]));

  const res = await fetch(`${ENOKI_API}/transaction-blocks/sponsor`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      network,
      sender,
      transactionBlockKindBytes: transactionKindBytes,
      // Defence in depth: only sponsor this sender's StreamLine calls, sending
      // objects to the sender plus any explicitly-declared transfer recipients.
      allowedAddresses,
      allowedMoveCallTargets: allowedMoveCallTargets(network, packageId),
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: "enoki_sponsor_failed", detail: json },
      { status: res.status }
    );
  }

  // Enoki wraps payloads in { data: { bytes, digest } }.
  return NextResponse.json(json.data ?? json);
}

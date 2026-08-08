"use client";

import { useQuery } from "@tanstack/react-query";
import type { SuiClient } from "@mysten/sui/client";

import { USDC_BASE } from "@/lib/stream-math";

/**
 * A merchant's payment QR. The QR *definition* (label, amount, active) is local
 * bookkeeping; the money and the usage/total stats are fully on-chain — every
 * scan-to-pay runs `pos::pay`, depositing into the org treasury and emitting a
 * `PosPaid` event that `usePosStats` aggregates per `id`.
 */
export type PosQr = {
  id: string;
  label: string;
  /** Fixed USDC amount, or null for an open (customer-entered) amount. */
  amountUsd: number | null;
  active: boolean;
  createdAtMs: number;
};

/**
 * Type origin of `pos::PosPaid`. The `pos` module was introduced in the
 * 2026-07-19 upgrade, so the event type is defined by that package id (not the
 * original 0x597f34fe… nor the mutable "latest" id). Events are queried by this.
 */
export const POS_DEFINING_PACKAGE =
  "0x05affbed7e9e8836d49e60762ccd172a63876bfefaef6e384b4f6103db6e539d";

function storageKey(owner: string) {
  return `sl-pro-pos:${owner.toLowerCase()}`;
}

export function loadPosQrs(owner: string): PosQr[] {
  if (typeof window === "undefined" || !owner) return [];
  try {
    const raw = localStorage.getItem(storageKey(owner));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PosQr[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePosQrs(owner: string, qrs: PosQr[]) {
  if (typeof window === "undefined" || !owner) return;
  localStorage.setItem(storageKey(owner), JSON.stringify(qrs));
}

/** Build the customer-facing pay link a QR encodes. */
export function buildPosPayUrl(
  qr: PosQr,
  treasuryId: string,
  orgName: string,
  origin?: string
): string {
  const base =
    origin ??
    (typeof window !== "undefined"
      ? window.location.origin
      : "https://strmln.space");
  const p = new URLSearchParams({ t: treasuryId, q: qr.id, l: qr.label });
  if (qr.amountUsd != null) p.set("a", String(qr.amountUsd));
  if (orgName.trim()) p.set("org", orgName.trim());
  return `${base}/pay/qr?${p.toString()}`;
}

export type PosPayParams = {
  treasuryId: string;
  qrId: string;
  label: string;
  /** Fixed amount in USDC, or null when the customer chooses. */
  amountUsd: number | null;
  org: string;
};

export function parsePosPayParams(
  search: string | URLSearchParams
): PosPayParams | null {
  const p =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search;
  const treasuryId = (p.get("t") ?? "").trim();
  const qrId = (p.get("q") ?? "").trim();
  if (!treasuryId || !qrId) return null;
  const aRaw = p.get("a");
  const amountUsd = aRaw != null && Number(aRaw) > 0 ? Number(aRaw) : null;
  return {
    treasuryId,
    qrId,
    label: (p.get("l") ?? "Payment").trim() || "Payment",
    amountUsd,
    org: (p.get("org") ?? "").trim(),
  };
}

export type PosQrStat = {
  uses: number;
  totalUsd: number;
  /** Newest payment's tx digest / time / payer — evidence for invoice settle. */
  lastDigest?: string;
  lastAtMs?: number;
  lastPayer?: string;
};
export type PosStats = {
  byQr: Record<string, PosQrStat>;
  totalUses: number;
  totalUsd: number;
};

type PosPaidEvent = {
  qr_id: string;
  treasury_id: string;
  payer: string;
  amount: string;
  timestamp_ms: string;
};

/**
 * Aggregate real per-QR uses and totals from on-chain `PosPaid` events for one
 * treasury. Reads events directly from the fullnode (no indexer dependency).
 */
export async function readPosStats(
  client: SuiClient,
  treasuryId: string
): Promise<PosStats> {
  const byQr: Record<string, PosQrStat> = {};
  let totalUses = 0;
  let totalBase = 0;
  let cursor: { txDigest: string; eventSeq: string } | null = null;
  // A few pages is plenty for a testnet counter; stop early when exhausted.
  for (let page = 0; page < 10; page++) {
    const res = await client.queryEvents({
      query: { MoveEventType: `${POS_DEFINING_PACKAGE}::pos::PosPaid` },
      cursor,
      limit: 50,
      order: "descending",
    });
    for (const ev of res.data) {
      const j = ev.parsedJson as PosPaidEvent | undefined;
      if (!j || j.treasury_id !== treasuryId) continue;
      const amt = Number(j.amount) || 0;
      const cur = byQr[j.qr_id] ?? { uses: 0, totalUsd: 0 };
      cur.uses += 1;
      cur.totalUsd += amt / USDC_BASE;
      // Descending order → first event seen for a qr is the newest.
      if (cur.lastDigest === undefined) {
        cur.lastDigest = ev.id?.txDigest;
        cur.lastAtMs = ev.timestampMs ? Number(ev.timestampMs) : undefined;
        cur.lastPayer = j.payer;
      }
      byQr[j.qr_id] = cur;
      totalUses += 1;
      totalBase += amt;
    }
    if (!res.hasNextPage || !res.nextCursor) break;
    cursor = res.nextCursor;
  }
  return { byQr, totalUses, totalUsd: totalBase / USDC_BASE };
}

export function usePosStats(client: SuiClient, treasuryId: string | undefined) {
  return useQuery({
    queryKey: ["pos-stats", treasuryId],
    queryFn: () => readPosStats(client, treasuryId!),
    enabled: !!treasuryId,
    refetchInterval: 15_000,
  });
}

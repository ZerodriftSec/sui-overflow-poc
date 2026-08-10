"use client";

/**
 * Market-maker desk bid (Pelagos / Sui) — SIMULATED secondary market.
 *
 * Self-contained, additive widget: given a held position size it fetches the
 * protocol market-maker's simulated bid (per-product spread below par) and
 * offers a "Sell to desk" that records the exit to History at that price. No
 * on-chain transaction — the fill is a simulated ledger event; the parent
 * reflects the closed position via `onSold` (e.g. clearing its virtual position
 * and refreshing), exactly as a redeem does.
 */

import { useEffect, useState } from "react";
import { C, FM, FD } from "../_lib/tokens";
import {
  fetchMmQuote,
  type MmProductType,
  type MmTrancheKind,
  type MmQuote,
} from "../_lib/mm-client";

// The off-chain MM desk fill (/api/mm/confirm) is DISABLED server-side (returns
// 410 MM_FILL_DISABLED) because it booked a payout with no on-chain transaction —
// a double-spend. Until an on-chain MM rail exists, the desk bid is shown as an
// INDICATIVE secondary mark only; exiting goes through the real on-chain Redeem.
const MM_DESK_FILLS_ENABLED = false;

export function MmDeskBid({
  productType,
  trancheKind,
  bundleId,
  sizeUsdc,
}: {
  productType: MmProductType;
  trancheKind?: MmTrancheKind;
  bundleId: string;
  /** Caller still passes these; the widget no longer needs them (indicative-only). */
  walletAddress?: string | null;
  /** Held position value to quote (display USDC). The widget hides itself at <= 0. */
  sizeUsdc: number;
  disabled?: boolean;
  onSold?: (payoutUsdc: number) => void;
}) {
  const quoteKey = `${productType}:${trancheKind ?? ""}:${bundleId}:${sizeUsdc}`;
  const [quoteState, setQuoteState] = useState<{ key: string; quote: MmQuote } | null>(null);

  useEffect(() => {
    if (!(sizeUsdc > 0)) return;
    const ctrl = new AbortController();
    fetchMmQuote({ productType, trancheKind, sizeUsdc, bundleId, signal: ctrl.signal })
      .then((quote) => setQuoteState({ key: quoteKey, quote }))
      .catch(() => {
        /* the bid is best-effort; hide on failure */
      });
    return () => ctrl.abort();
  }, [productType, trancheKind, sizeUsdc, bundleId, quoteKey]);

  // A quote is only renderable for the exact inputs that produced it. Changing
  // size or product hides the previous response while the next fetch is in flight.
  const quote = quoteState?.key === quoteKey ? quoteState.quote : null;

  if (!(sizeUsdc > 0) || !quote) return null;

  return (
    <div
      style={{
        marginTop: 12,
        padding: "10px 12px",
        border: `0.5px solid ${C.border}`,
        borderRadius: 10,
        background: C.surface,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: FM, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textMuted }}>
          Market-maker desk bid
        </span>
        <span style={{ fontFamily: FM, fontSize: 10.5, color: C.textMuted }}>
          {(quote.spread_bps / 100).toFixed(2)}% below {quote.mark_source === "par" ? "par" : "mark"}
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 6 }}>
        <span style={{ fontFamily: FD, fontSize: 18, fontWeight: 600, color: C.textPrimary }}>
          ${quote.payout_usdc.toFixed(2)}
        </span>
        <span style={{ fontFamily: FM, fontSize: 11, color: C.textSecondary }}>
          ${quote.bid_per_unit.toFixed(4)}/unit · mark ${quote.mark_per_unit.toFixed(4)}
          {quote.mark_source === "live_nav" ? " · live NAV" : quote.mark_source === "tranche_model" ? " · model" : ""}
        </span>
      </div>
      {MM_DESK_FILLS_ENABLED ? null : (
        <div style={{ marginTop: 10, fontFamily: FM, fontSize: 10.5, lineHeight: 1.5, color: C.textMuted }}>
          Indicative secondary mark. To exit, use{" "}
          <span style={{ color: C.textSecondary, fontWeight: 600 }}>Redeem</span> below — a real on-chain
          transaction, net of the {(quote.spread_bps / 100).toFixed(2)}% desk spread.
        </div>
      )}
    </div>
  );
}

import { Router, Request, Response } from 'express';
import { quoteSellToMM, MM_BID_BPS, type ProductKind, type TrancheKind, type MarkSource } from '../services/mm-quote';
import { getBundleById, getLegsByBundleId } from '../db/queries';
import { getLiveNAV } from '../services/pricing';
import { quoteTranches, basketSigmaFromLegs } from '../services/tranching';

/**
 * Market-maker secondary-market routes (Pelagos / Sui).
 *
 * The protocol market-maker QUOTES a bid for a pre-settlement position. On
 * Pelagos there is no on-chain MM rail, so the bid is priced off-chain and an
 * accepted bid settles as a SIMULATED exit recorded to the ledger (History):
 *   POST /api/mm/quote    → price a per-product MM bid (off-chain pricing)
 *   GET  /api/mm/spreads  → the per-product bid table (UI/debug)
 *   POST /api/mm/confirm  → record an accepted (simulated) sell to History
 */

const router = Router();

const PRODUCT_KINDS: ProductKind[] = ['basket', 'tranche', 'note'];

function trancheFrom(v: unknown): TrancheKind | undefined {
  return v === 'junior' ? 'junior' : v === 'mezzanine' ? 'mezzanine' : v === 'senior' ? 'senior' : undefined;
}

/**
 * Resolve the LIVE per-unit mark for a position so the MM bid is anchored to
 * real value, not par:
 *   basket  → live NAV (getLiveNAV, refreshed from Polymarket)
 *   tranche → the tranche's model fair value (quoteTranches at the live NAV)
 *   note    → par (1) — principal-protected, trades at/above par pre-maturity
 * Falls back to par when no bundle_id is given or the live data is unavailable.
 */
async function resolveMark(
  productType: ProductKind,
  bundleId: string | undefined,
  trancheKind: TrancheKind | undefined,
): Promise<{ mark: number; source: MarkSource }> {
  if (!bundleId || productType === 'note') return { mark: 1, source: 'par' };

  const navRes = await getLiveNAV(bundleId).catch(() => null);
  const bundle = await getBundleById(bundleId).catch(() => null);
  const nav = navRes?.nav ?? bundle?.issue_price ?? null;
  if (nav === null || !Number.isFinite(nav)) return { mark: 1, source: 'par' };

  if (productType === 'basket') return { mark: nav, source: 'live_nav' };

  // tranche → price the slice off the live NAV with the real leg count + horizon.
  const legs = await getLegsByBundleId(bundleId).catch(() => []);
  const horizonDays = bundle?.resolution_date
    ? Math.max(1, Math.ceil((new Date(bundle.resolution_date).getTime() - Date.now()) / 86_400_000))
    : 30;
  const tqs = quoteTranches({
    bundleNav: nav,
    totalLegs: Math.max(1, legs.length),
    horizonDays,
    tier: bundle?.risk_tier,
    sigma: basketSigmaFromLegs(legs) ?? undefined,
  });
  const t = tqs.find((x) => x.kind === (trancheKind ?? 'senior'));
  return t ? { mark: t.fairPrice, source: 'tranche_model' } : { mark: nav, source: 'live_nav' };
}

/**
 * POST /api/mm/quote
 * body: { product_type, size_usdc, tranche_kind?, bundle_id? }
 * → MM bid anchored to the position's LIVE mark, spread simulated.
 */
router.post('/quote', async (req: Request, res: Response) => {
  try {
    const { product_type, size_usdc, tranche_kind, bundle_id } = (req.body ?? {}) as {
      product_type?: string;
      size_usdc?: number;
      tranche_kind?: string;
      bundle_id?: string;
    };
    const productType = product_type as ProductKind;
    if (!PRODUCT_KINDS.includes(productType)) {
      return res.status(400).json({ error: 'product_type must be basket | tranche | note' });
    }
    const size = Number(size_usdc);
    if (!Number.isFinite(size) || size <= 0) {
      return res.status(400).json({ error: 'size_usdc must be a positive number' });
    }
    const trancheKind = trancheFrom(tranche_kind);
    const { mark, source } = await resolveMark(productType, bundle_id, trancheKind);
    const quote = quoteSellToMM({ productType, sizeUsdc: size, trancheKind, markPerUnit: mark, markSource: source });
    return res.json(quote);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

/** GET /api/mm/spreads → the per-product MM bid table (bps of par). */
router.get('/spreads', (_req: Request, res: Response) => {
  res.json({ bid_bps: MM_BID_BPS });
});

/**
 * POST /api/mm/confirm — record an accepted (simulated) MM sell so it appears in
 * History as a pre-settlement exit. The fill is off-chain on Pelagos; the
 * signature is a synthetic simulated-fill id (idempotent by signature).
 */
router.post('/confirm', async (_req: Request, res: Response) => {
  // DISABLED: the previous implementation recorded a client-supplied payout to
  // History with NO on-chain transaction and WITHOUT burning the user's VaultShare
  // — i.e. it credited a "sale" while the position was never given up (a double-
  // spend) and the proceeds were attacker-chosen. A sell MUST be a real on-chain
  // transaction. Until the MM desk settles on-chain (the operator buying the share
  // and paying the quoted bid − spread − slippage in one signed tx), accepted MM
  // bids cannot be booked. Sell via the real on-chain paths instead: redeem
  // (baskets / PPN / tranches) or hold-to-expiry settle (options / strips / vol).
  return res.status(410).json({
    error:
      'MM desk fills are not settled on-chain yet. Use redeem (baskets/PPN/tranche) or settle-at-expiry (options/strips/vol) — both are real on-chain transactions.',
    code: 'MM_FILL_DISABLED',
  });
});

export default router;

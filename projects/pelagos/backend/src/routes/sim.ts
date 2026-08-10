/**
 * mUSDC simulation-settlement routes (/api/sim).
 *
 * An INDEPENDENT settlement rail from dUSDC/Predict: structured positions settle
 * against our own freely-mintable mUSDC (`mock_usdc`) + generic `Vault<MOCK_USDC>`.
 * No swap, no peg to dUSDC. See services/sim-settlement.ts.
 *
 *   POST /open/prepare  — build the user-signed mUSDC premium deposit (labelled).
 *   POST /confirm       — mark the position open once the deposit confirms.
 *   POST /settle        — compute the realized payoff and mint it in mUSDC.
 *   GET  /positions/:owner — list a wallet's sim positions.
 */
import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  prepareSimOpen,
  confirmSimOpen,
  settleSim,
  listSimPositions,
  MAX_PAYOFF_MULTIPLE,
  type SimProduct,
  type SimBand,
} from '../services/sim-settlement';

const router = Router();

// Open-time inflation guard. SIM economics (bands / max_payout) are CLIENT-DECLARED
// for the freely-mintable DEMO token (mUSDC) — the server does not yet re-price the
// structured product from live chain state (the production-correct fix; out of scope
// here, see sim-settlement.ts). So we bound max_payout to a defensible multiple of
// the deposited premium at OPEN, mirroring the settle-time cap. We deliberately reuse
// the SAME exported constant so open-time and settle-time can never silently diverge:
// a position that would be capped/clamped at settle is simply rejected up front with a
// clear error instead of opening and then under-paying.
const MAX_OPEN_MULTIPLE = MAX_PAYOFF_MULTIPLE;

// /settle drives an OPERATOR-signed mUSDC mint (services/sim-settlement →
// mintMockUsdc). The mint recipient + amount are NOT attacker-controlled (they
// come from the recorded position's owner + economics, and settle is idempotent),
// but the operator still pays gas on the first settle of any position. Throttle
// per-IP so an anonymous caller can't spam operator-signed mints / drain gas.
const settleLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many settlement requests, please try again later' },
});

// Yield and note economics are admitted only through their canonical quote-id
// routes. Allowing callers to declare those labels here would make an arbitrary
// client-authored payoff look like a server-priced strategy in Portfolio.
const CLIENT_DECLARED_PRODUCTS: SimProduct[] = ['strip', 'option', 'vol', 'dist'];

/** Parse + VALIDATE client-supplied bands. Bands are the realized payout schedule
 *  for the DEMO token, so a malformed band is an integrity bug, not something to
 *  silently coerce: we throw on the first bad band rather than dropping it (a dropped
 *  band would settle that price region to $0 instead of the user's intended payout).
 *  Rejects: non-finite coordinates, inverted/degenerate ranges (lower >= higher), and
 *  negative payouts. The per-band-vs-max_payout and premium-multiple checks live in
 *  the route handler, where the premium/max_payout context is available. */
function parseBands(v: unknown): SimBand[] {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new Error('bands must be an array');
  return v.map((b, i) => {
    const o = (b ?? {}) as Record<string, unknown>;
    const lower_usd = Number(o.lower_usd);
    const higher_usd = Number(o.higher_usd);
    const payout_usd = Number(o.payout_usd);
    if (!Number.isFinite(lower_usd) || !Number.isFinite(higher_usd) || !Number.isFinite(payout_usd)) {
      throw new Error(`band ${i} has non-finite lower/higher/payout`);
    }
    if (!(lower_usd < higher_usd)) throw new Error(`band ${i} is inverted or degenerate (lower must be < higher)`);
    if (payout_usd < 0) throw new Error(`band ${i} has a negative payout`);
    return { lower_usd, higher_usd, payout_usd };
  });
}

router.post('/open/prepare', async (req: Request, res: Response) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const owner = String(b.owner ?? b.wallet_address ?? '');
    if (!/^0x[0-9a-fA-F]+$/.test(owner)) throw new Error('owner (0x...) is required');
    if (b.product === 'yield' || b.product === 'note') {
      throw new Error(`${String(b.product)} positions require the canonical quote-id open route`);
    }
    if (b.product != null && !CLIENT_DECLARED_PRODUCTS.includes(b.product as SimProduct)) {
      throw new Error(`product must be one of ${CLIENT_DECLARED_PRODUCTS.join(', ')}`);
    }
    const product = (b.product ?? 'strip') as SimProduct;
    const premiumUsd = Number(b.premium_usd ?? b.notional_usd ?? 0);
    if (!(premiumUsd > 0) || !Number.isFinite(premiumUsd)) throw new Error('premium_usd must be a positive number');
    const maxPayoutUsd = Number(b.max_payout_usd ?? premiumUsd);
    if (!Number.isFinite(maxPayoutUsd) || maxPayoutUsd <= 0) throw new Error('max_payout_usd must be a positive number');
    const forwardUsd = Number(b.forward_usd ?? 0);
    if (!Number.isFinite(forwardUsd) || forwardUsd < 0) throw new Error('forward_usd must be a non-negative number');

    // INTEGRITY (mUSDC demo token): the settled mint is bounded by these declared
    // economics (see sim-settlement.ts), so validate them at open instead of silently
    // clamping at settle. Reject up front any position that could not settle to its
    // declared payout — a stale/over-stated quote should fail visibly, not mint short.
    const bands = parseBands(b.bands);
    // No declared band may pay more than the declared max_payout (the settle cap honors
    // max_payout; equality is legit — the best strip bucket pays exactly max_payout).
    for (let i = 0; i < bands.length; i++) {
      if (bands[i].payout_usd > maxPayoutUsd + 1e-9) {
        throw new Error(`band ${i} payout exceeds max_payout_usd`);
      }
    }
    // max_payout may not exceed a defensible multiple of the deposited premium. This is
    // the open-time twin of the settle-time MAX_PAYOFF_MULTIPLE cap; sharing the
    // constant keeps the two ends from diverging. Blocks the tiny-premium / huge-payout
    // inflation that would otherwise free-mint up to 100x and bypass the faucet cap.
    if (maxPayoutUsd > premiumUsd * MAX_OPEN_MULTIPLE + 1e-9) {
      throw new Error(`max_payout_usd may not exceed premium_usd * ${MAX_OPEN_MULTIPLE}`);
    }

    // Validate expiry when supplied: a non-finite or already-past expiry is nonsensical
    // (settle is expiry-gated, so a past expiry would let the position settle the instant
    // it opens). null/omitted is allowed — those products settle on the oracle alone.
    let expiryMs: number | null = null;
    if (b.expiry_ms != null) {
      expiryMs = Number(b.expiry_ms);
      if (!Number.isFinite(expiryMs) || expiryMs <= Date.now()) {
        throw new Error('expiry_ms must be a finite future timestamp in milliseconds');
      }
    }

    const out = await prepareSimOpen({
      owner,
      product,
      name: typeof b.name === 'string' ? b.name : product,
      premium_usd: premiumUsd,
      max_payout_usd: maxPayoutUsd,
      oracle_id: typeof b.oracle_id === 'string' ? b.oracle_id : null,
      forward_usd: forwardUsd,
      expiry_ms: expiryMs,
      bands,
    });
    res.json(out);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.post('/confirm', async (req: Request, res: Response) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const simId = String(b.sim_id ?? '');
    const digest = String(b.digest ?? '');
    if (!simId || !digest) throw new Error('sim_id and digest are required');
    res.json(await confirmSimOpen(simId, digest));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.post('/settle', settleLimiter, async (req: Request, res: Response) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const simId = String(b.sim_id ?? '');
    if (!simId) throw new Error('sim_id is required');
    res.json(await settleSim(simId));
  } catch (err) {
    // Client-actionable errors (bad/stale id, validation) → 4xx; reserve 500 for
    // genuine on-chain/RPC failures.
    const msg = (err as Error).message;
    if (/unknown sim position/i.test(msg)) return res.status(404).json({ error: msg });
    if (/required|invalid|non-finite|must be|not open|not yet at expiry|until expiry|observation|awaiting authoritative settlement|in progress|already|reconciliation/i.test(msg))
      return res.status(400).json({ error: msg });
    res.status(500).json({ error: msg });
  }
});

router.get('/positions/:owner', async (req: Request, res: Response) => {
  try {
    res.json({ positions: await listSimPositions(req.params.owner) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export const simRoutes = router;

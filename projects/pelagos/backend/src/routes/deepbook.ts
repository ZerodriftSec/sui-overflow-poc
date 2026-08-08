/**
 * DeepBook Strategy Engine routes (/api/deepbook).
 *
 *   GET  /strategies — the prebuilt structured-strategy catalogue, tagged by
 *                      tail-risk / convexity / payoff shape.
 *   POST /quote      — price a chosen strategy as a real range strip on a live
 *                      DeepBook Predict BTC oracle (get_range_trade_amounts
 *                      devInspect), with Greeks and the on-chain routing handles.
 *
 * Every quote is the protocol's REAL strip pricing — buckets, total cost, and
 * realized max payout come straight from the on-chain MM. The frontend uses
 * `oracle_id` + `expiry` + `strip.buckets` to deploy via the existing
 * /api/predict/strip/open/prepare (wallet-signed) path.
 */
import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  listStrategies,
  quoteStrategy,
  listExpiries,
  type ExpiryPref,
} from '../services/deepbook-strategies';
import {
  getYieldQuote,
  listYieldStrategies,
  quoteYieldStrategy,
  yieldAccount,
} from '../services/deepbook-yield';
import * as structured from '../services/predict/structured';
import { prepareSimOpen } from '../services/sim-settlement';
import { predictServer } from '../services/predict/server';

const router = Router();

const yieldQuoteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many yield-quote requests, please try again later' },
});

const yieldAccountLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many yield-account requests, please try again later' },
});

function parseExpiryPref(v: unknown): ExpiryPref | undefined {
  if (v === 'near' || v === 'mid' || v === 'far') return v;
  return undefined;
}

// Snap a requested notional to a small bucket set BEFORE it reaches quoteStrategy,
// which uses notionalUsd in its 8s quote-cache key + drives on-chain devInspect
// fan-out. An attacker passing arbitrary/fractional notionals would otherwise bust
// the cache on every request and force unbounded devInspect calls. Buckets keep
// the quote economically meaningful while collapsing the key space.
const NOTIONAL_BUCKETS = [10, 100, 1000, 10_000, 100_000];
function bucketNotionalUsd(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 100;
  const clamped = Math.min(NOTIONAL_BUCKETS[NOTIONAL_BUCKETS.length - 1], Math.max(NOTIONAL_BUCKETS[0], n));
  // Nearest bucket in log space (buckets are geometric).
  let best = NOTIONAL_BUCKETS[0];
  let bestDist = Infinity;
  for (const b of NOTIONAL_BUCKETS) {
    const d = Math.abs(Math.log(clamped) - Math.log(b));
    if (d < bestDist) {
      bestDist = d;
      best = b;
    }
  }
  return best;
}

/** GET /api/deepbook/strategies — the prebuilt strategy catalogue. */
router.get('/strategies', (_req: Request, res: Response) => {
  try {
    res.json({ strategies: listStrategies() });
  } catch (err) {
    console.error('GET /api/deepbook/strategies error:', err);
    res.status(500).json({ error: 'Failed to list strategies' });
  }
});

/** GET /api/deepbook/expiries — every active BTC oracle as a selectable expiry. */
router.get('/expiries', async (_req: Request, res: Response) => {
  try {
    res.json({ expiries: await listExpiries() });
  } catch (err) {
    console.error('GET /api/deepbook/expiries error:', err);
    res.status(500).json({ error: 'Failed to list expiries' });
  }
});

/** Counterparty/PLP strategy catalogue. */
router.get('/yield/strategies', (_req: Request, res: Response) => {
  res.json(listYieldStrategies());
});

/** Live PLP + hedge quote, including current-book stress identities. */
router.post('/yield/quote', yieldQuoteLimiter, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.strategy_id !== 'string' || !body.strategy_id) {
      return res.status(400).json({ error: 'strategy_id is required' });
    }
    const capital = Number(body.capital_usd);
    if (!Number.isFinite(capital)) return res.status(400).json({ error: 'capital_usd must be finite' });
    res.json(
      await quoteYieldStrategy({
        strategyId: body.strategy_id,
        capitalUsd: capital,
        sender: typeof body.sender === 'string' ? body.sender : undefined,
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/not currently quoteable/i.test(message)) {
      return res.status(503).json({ error: message, code: 'PREDICT_UNAVAILABLE' });
    }
    res.status(/unknown|between|must be|missing|expired/i.test(message) ? 400 : 500).json({ error: message });
  }
});

/** Wallet's real PLP coin balance and mark-to-NAV value. */
router.get('/yield/account/:owner', yieldAccountLimiter, async (req: Request, res: Response) => {
  try {
    res.json(await yieldAccount(req.params.owner));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(/owner must/i.test(message) ? 400 : 500).json({ error: message });
  }
});

/** Exit all positive range positions in one owner-verified PredictManager. */
router.post('/yield/ranges/exit/prepare', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const owner = typeof body.owner === 'string' ? body.owner : '';
    const managerId = typeof body.manager_id === 'string' ? body.manager_id : '';
    if (!/^0x[0-9a-fA-F]{64}$/.test(owner)) throw new Error('owner must be a 32-byte Sui address');
    if (!/^0x[0-9a-fA-F]{64}$/.test(managerId)) throw new Error('manager_id is required');
    const manager = await predictServer.managerSummary(managerId) as { owner?: unknown };
    if (String(manager.owner ?? '').toLowerCase() !== owner.toLowerCase()) {
      throw new Error('manager_id is not owned by owner');
    }
    const positions = await predictServer.managerPositions(managerId) as {
      ranges?: Array<{
        oracle_id: string;
        expiry: string;
        lower_strike: string;
        higher_strike: string;
        quantity: string;
      }>;
    };
    const ranges = (positions.ranges ?? [])
      .filter((range) => BigInt(range.quantity) > 0n)
      .map((range) => ({
        oracleId: range.oracle_id,
        expiry: range.expiry,
        lower: range.lower_strike,
        higher: range.higher_strike,
        quantity: range.quantity,
      }));
    res.json(await structured.prepareRedeemRangePortfolio({ owner, managerId, ranges }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(/required|must be|not owned|no positive/i.test(message) ? 400 : 500).json({ error: message });
  }
});

/**
 * Canonical yield open. The client sends only quote_id + rail; terminal bands and
 * allocations are loaded from the unexpired server quote and cannot be inflated.
 */
router.post('/yield/open/prepare', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const owner = typeof body.owner === 'string' ? body.owner : '';
    if (!/^0x[0-9a-fA-F]{64}$/.test(owner)) throw new Error('owner must be a 32-byte Sui address');
    const quoteId = typeof body.quote_id === 'string' ? body.quote_id : '';
    if (!quoteId) throw new Error('quote_id is required');
    const currency = body.currency === 'mUSDC' ? 'mUSDC' : body.currency === 'dUSDC' ? 'dUSDC' : null;
    if (!currency) throw new Error('currency must be dUSDC or mUSDC');
    const quote = getYieldQuote(quoteId);

    if (currency === 'mUSDC') {
      const prep = await prepareSimOpen({
        owner,
        product: 'yield',
        name: quote.strategy.name,
        premium_usd: quote.capital_usd,
        max_payout_usd: quote.musdc_model.maximum_terminal_usd,
        oracle_id: quote.reference_book.oracle_id,
        forward_usd: quote.reference_book.forward_usd,
        expiry_ms: Number(quote.reference_book.expiry),
        bands: quote.musdc_model.terminal_bands,
      });
      return res.json({ ...prep, quote_id: quoteId, rail: 'mUSDC-reference' });
    }

    if (!quote.hedge) {
      const prep = await structured.preparePlpSupply({ owner, amountRaw: BigInt(quote.capital_raw) });
      return res.json({ ...prep, quote_id: quoteId, rail: 'dUSDC-plp' });
    }
    const managerId = typeof body.manager_id === 'string' ? body.manager_id : '';
    if (!/^0x[0-9a-fA-F]{64}$/.test(managerId)) throw new Error('manager_id is required for a hedged dUSDC strategy');
    const manager = await predictServer.managerSummary(managerId) as { owner?: unknown };
    if (String(manager.owner ?? '').toLowerCase() !== owner.toLowerCase()) {
      throw new Error('manager_id is not owned by owner');
    }
    const prep = await structured.preparePlpHedgedOpen({
      owner,
      managerId,
      plpRaw: BigInt(quote.allocation.plp_raw),
      hedgeFundingRaw: BigInt(quote.allocation.hedge_funding_raw),
      legs: [
        {
          oracleId: quote.hedge.oracle_id,
          expiry: quote.hedge.expiry,
          buckets: quote.hedge.raw_buckets,
        },
      ],
    });
    return res.json({ ...prep, quote_id: quoteId, rail: 'dUSDC-plp-plus-hedge' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(/required|must be|missing|expired|insufficient|unknown|not owned/i.test(message) ? 400 : 500).json({ error: message });
  }
});

/**
 * POST /api/deepbook/quote
 * body: { strategy_id, notional_usd, expiry_pref?: "near"|"mid"|"far" }
 * Prices the strategy's strip on a live BTC oracle (real on-chain devInspect).
 */
router.post('/quote', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const strategyId = typeof body.strategy_id === 'string' ? body.strategy_id : '';
    if (!strategyId) {
      return res.status(400).json({ error: 'strategy_id is required' });
    }
    const notionalUsd = bucketNotionalUsd(body.notional_usd ?? body.notional ?? 100);
    const out = await quoteStrategy({
      strategyId,
      notionalUsd,
      expiryPref: parseExpiryPref(body.expiry_pref),
      oracleId: typeof body.oracle_id === 'string' ? body.oracle_id : undefined,
      sender: typeof body.sender === 'string' ? body.sender : undefined,
    });
    res.json({
      strategy_id: out.strategy_id,
      name: out.name,
      thesis: out.thesis,
      tail_risk: out.tail_risk,
      convexity: out.convexity,
      payoff_shape: out.payoff_shape,
      direction: out.direction,
      risk_note: out.risk_note,
      oracle_id: out.oracle_id,
      expiry: out.expiry,
      tenor_label: out.tenor_label,
      notional_usd: out.notional_usd,
      forward_usd: out.forward_usd,
      center_usd: out.center_usd,
      sigma_usd: out.sigma_usd,
      atm_iv: out.atm_iv,
      t_years: out.t_years,
      max_loss_usd: out.max_loss_usd,
      strip: out.strip,
      greeks: out.greeks,
      dusdc_decimals: out.dusdc_decimals,
      source: out.source,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/unknown strategy/i.test(message)) {
      return res.status(400).json({ error: message });
    }
    if (/no active BTC oracle/i.test(message)) {
      return res.status(404).json({ error: message });
    }
    if (/not currently quoteable/i.test(message)) {
      return res.status(503).json({ error: message, code: 'PREDICT_UNAVAILABLE' });
    }
    console.error('POST /api/deepbook/quote error:', err);
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/deepbook/distribution
 * The live BTC market-implied distribution, straight off the DeepBook Predict
 * order book: a range-plateau strip on a longer-dated oracle, with each band's
 * normalized implied probability. Powers the landing hero chart (no params).
 */
type DistBucket = { lower_usd: number; higher_usd: number; mint_cost_raw: string; quantity: string; tradeable: boolean };
router.get('/distribution', async (_req: Request, res: Response) => {
  try {
    const out = await quoteStrategy({ strategyId: 'range-plateau', notionalUsd: 100, expiryPref: 'far' });
    const buckets = ((out.strip?.buckets ?? []) as DistBucket[]).filter((b) => b.tradeable && Number(b.quantity) > 0);
    const raw = buckets.map((b) => {
      const qtyRaw = Number(b.quantity);
      const costRaw = Number(b.mint_cost_raw);
      // Coerce defensively: a non-finite qty/cost (malformed on-chain field) must
      // NOT propagate NaN into prob — NaN is truthy, so a NaN sum would slip past
      // a `|| 1` guard and blank every band, vanishing the landing hero bars.
      const qty = Number.isFinite(qtyRaw) ? qtyRaw / 1e6 : 0;
      const cost = Number.isFinite(costRaw) ? costRaw / 1e6 : 0;
      // For a $1 binary, per-contract cost ≈ P(BTC settles in this band).
      const prob = qty > 0 ? Math.max(0, cost / qty) : 0;
      return { lower_usd: b.lower_usd, higher_usd: b.higher_usd, prob: Number.isFinite(prob) ? prob : 0 };
    });
    const sum = raw.reduce((a, b) => a + b.prob, 0);
    const denom = Number.isFinite(sum) && sum > 0 ? sum : 1;
    const bands = raw.map((b) => ({ ...b, prob: b.prob / denom }));
    res.json({
      source: out.source,
      oracle_id: out.oracle_id,
      forward_usd: out.forward_usd,
      tenor_label: out.tenor_label,
      atm_iv: out.atm_iv,
      bands,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/no active BTC oracle/i.test(message)) return res.status(404).json({ error: message });
    console.error('GET /api/deepbook/distribution error:', err);
    res.status(500).json({ error: message });
  }
});

export const deepbookRoutes = router;

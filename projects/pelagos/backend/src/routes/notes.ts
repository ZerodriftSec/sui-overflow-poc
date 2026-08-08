import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  listStrategies,
  quoteNote,
  getNoteQuote,
  NoteQuoteError,
} from '../services/notes-allocation';
import * as structured from '../services/predict/structured';
import { prepareSimOpen } from '../services/sim-settlement';
import { predictServer } from '../services/predict/server';

const router = Router();

// /quote prices a funded PLP reserve + live DeepBook strip (or a discrete
// autocall observation schedule). A dedicated per-IP limiter bounds the live
// quote work while staying generous for real UI re-quotes.
const quoteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many note-quote requests, please try again later' },
});

// Bound the free-text preset id and reject non-finite / non-positive sizes early
// so a malformed request can't drive the pricing pipeline with garbage.
const MAX_PRESET_ID_LEN = 200;

/**
 * GET /api/notes/strategies
 *
 * Fully-funded terminal participation, range coupon, terminal knock-in/out,
 * two-way buffer, and discrete autocall definitions.
 */
router.get('/strategies', (_req: Request, res: Response) => {
  try {
    res.json(listStrategies());
  } catch (err) {
    console.error('GET /api/notes/strategies error:', err);
    res.status(500).json({ error: 'Failed to build note strategies' });
  }
});

/**
 * POST /api/notes/quote
 * body: { principal_usd: number, preset_id: string, tenor_days?: number }
 *
 * Prices one note from live PLP state and DeepBook range quotes. The response
 * reconciles reserve + strip premium + manager buffer to principal and exposes
 * static, current-book, and theoretical downside cases.
 */
router.post('/quote', quoteLimiter, async (req: Request, res: Response) => {
  try {
    const { principal_usd, preset_id, tenor_days } = req.body as {
      principal_usd?: number;
      preset_id?: string;
      tenor_days?: number;
    };
    // Bound the only unbounded input here (preset_id string); quoteNote already
    // rejects non-finite/non-positive principal & tenor and caps the tenor.
    if (typeof preset_id === 'string' && preset_id.length > MAX_PRESET_ID_LEN) {
      return res.status(400).json({ error: `preset_id must be <= ${MAX_PRESET_ID_LEN} chars` });
    }
    const quote = await quoteNote({
      principalUsd: Number(principal_usd),
      presetId: String(preset_id ?? ''),
      tenorDays: tenor_days === undefined ? undefined : Number(tenor_days),
      sender: typeof (req.body as Record<string, unknown>).sender === 'string'
        ? String((req.body as Record<string, unknown>).sender)
        : undefined,
    });
    res.json(quote);
  } catch (err) {
    if (err instanceof NoteQuoteError) {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    const message = err instanceof Error ? err.message : String(err);
    if (/not currently quoteable|no quoteable oracle/i.test(message)) {
      return res.status(503).json({ error: message, code: 'PREDICT_UNAVAILABLE' });
    }
    console.error('POST /api/notes/quote error:', err);
    res.status(500).json({ error: 'Failed to quote note' });
  }
});

/**
 * Canonical note open. Allocations/payoff bands come from the unexpired server
 * quote; the browser cannot replace them with a larger payout schedule.
 */
router.post('/open/prepare', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const owner = typeof body.owner === 'string' ? body.owner : '';
    if (!/^0x[0-9a-fA-F]{64}$/.test(owner)) throw new Error('owner must be a 32-byte Sui address');
    const quoteId = typeof body.quote_id === 'string' ? body.quote_id : '';
    if (!quoteId) throw new Error('quote_id is required');
    const currency = body.currency === 'mUSDC' ? 'mUSDC' : body.currency === 'dUSDC' ? 'dUSDC' : null;
    if (!currency) throw new Error('currency must be dUSDC or mUSDC');
    const quote = getNoteQuote(quoteId);
    if (!quote.preset.supported_currencies.includes(currency)) {
      throw new Error(`${quote.preset.name} is not available on ${currency}; its early-call lifecycle is mUSDC-only`);
    }

    if (currency === 'mUSDC') {
      if (!quote.oracle) throw new Error('note quote has no settlement oracle');
      const prep = await prepareSimOpen({
        owner,
        product: 'note',
        name: quote.preset.name,
        premium_usd: quote.principal_usd,
        max_payout_usd: quote.outcomes.best_case_usd,
        oracle_id: quote.oracle.oracle_id,
        forward_usd: quote.autocall_terms?.initial_reference_usd ?? quote.oracle.forward_usd,
        expiry_ms: Number(quote.oracle.expiry),
        bands: quote.terminal_bands,
        autocall_terms: quote.autocall_terms,
      });
      return res.json({
        ...prep,
        quote_id: quoteId,
        rail: quote.autocall_terms ? 'mUSDC-autocall' : 'mUSDC-terminal-note',
      });
    }

    if (!quote.allocation || !quote.strip || !quote.oracle) throw new Error('dUSDC note execution plan is unavailable');
    const managerId = typeof body.manager_id === 'string' ? body.manager_id : '';
    if (!/^0x[0-9a-fA-F]{64}$/.test(managerId)) throw new Error('manager_id is required for a dUSDC note');
    const manager = await predictServer.managerSummary(managerId) as { owner?: unknown };
    if (String(manager.owner ?? '').toLowerCase() !== owner.toLowerCase()) {
      throw new Error('manager_id is not owned by owner');
    }
    const prep = await structured.preparePlpHedgedOpen({
      owner,
      managerId,
      plpRaw: BigInt(quote.allocation.plp_reserve_raw),
      hedgeFundingRaw: BigInt(quote.allocation.strip_funding_raw),
      legs: [
        {
          oracleId: quote.oracle.oracle_id,
          expiry: quote.oracle.expiry,
          buckets: quote.strip.raw_buckets,
        },
      ],
    });
    return res.json({ ...prep, quote_id: quoteId, rail: 'dUSDC-plp-plus-strip' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(/required|must be|missing|expired|not available|unavailable|insufficient|not owned/i.test(message) ? 400 : 500).json({ error: message });
  }
});

export const notesRoutes = router;

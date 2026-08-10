/**
 * mUSDC simulation settlement — an INDEPENDENT settlement venue, fully decoupled
 * from dUSDC / Mysten DeepBook Predict.
 *
 * dUSDC settles structured products on the real Predict order book (faucet-gated,
 * scarce). mUSDC is OUR freely-mintable currency (`mock_usdc`, a shared faucet we
 * control) used to simulate the same products in perpetuity. There is NO swap or
 * peg between the two — they are two separate rails on the same priced product.
 *
 * Mechanism (real on-chain, infinite supply, we control the payout):
 *   • OPEN  — the user deposits the premium into our generic `Vault<MOCK_USDC>`
 *             (real `vault::deposit`, a transferable `Vaultshare` receipt tagged
 *             with a `sim:<product>:<id>` label). The premium becomes house float.
 *   • SETTLE— the protocol computes the realized payoff from the recorded position
 *             economics + the live settlement forward, and mints exactly that much
 *             mUSDC to the holder (`mock_usdc::mint`). The share is NOT redeemed,
 *             so net P&L = payoff − premium models BOTH wins and losses correctly.
 *
 * Honest framing: mUSDC = "simulation with real on-chain custody + receipts," not
 * real Predict settlement. The UI labels it as such.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { prepareDeposit, confirmDigest, decodeVaultLabel, type PreparedTx } from './vault/index';
import { mintMockUsdc } from './mock-usdc';
import { predictServer } from './predict/server';
import { statePath } from './state-dir';
import { authoritativeSettlementUsd, resolveAutocall, type AutocallTerms } from './structured-payoffs';

export type SimProduct = 'strip' | 'option' | 'vol' | 'dist' | 'yield' | 'note';

// Integrity guard for the SIM rail's freely-mintable DEMO token (mUSDC).
//
// WHY this exists: sim economics (bands / max_payout / forward) are CLIENT-DECLARED
// for the demo token — the server does not yet re-price the structured product from
// live chain state at open. So the only thing standing between a position and an
// arbitrary mUSDC mint at settle is this cap: a settled payoff may never exceed this
// multiple of the premium actually deposited (verified on-chain in confirmSimOpen).
// Without it, a position with a tiny premium + a huge declared band payout could mint
// up to 100x premium as brand-new supply, bypassing the 1,000,000 mUSDC faucet cap
// and breaking simulation integrity.
//
// The PRODUCTION-CORRECT fix is server-side product re-pricing (re-derive the band
// ladder + max_payout from the same quote service the FE uses, keyed by oracle_id +
// product params, and ignore client bands) — that is a larger item and OUT OF SCOPE
// here. 50 is the tightest bound that still admits EVERY legitimate structure: an
// option pays max_payout=qty for premium≈ask*qty, so its leverage is 1/ask, and the
// protocol's 2%–98% mintable band floors ask at 0.02 → a legit deep-OTM option can be
// up to 50x (a 2%-probability $1 binary). Anything beyond 50x is impossible for a
// real tradeable structure, so it can only be a client-inflated payout — blocked. This
// still kills the 100x mint / faucet-cap-bypass hole. (Range strips & PPN sit far
// under 50x.)
//
// EXPORTED so open-time validation (routes/sim.ts MAX_OPEN_MULTIPLE) and this
// settle-time cap enforce the SAME multiple and can never silently diverge.
export const MAX_PAYOFF_MULTIPLE = 50;

export interface SimBand {
  lower_usd: number;
  higher_usd: number;
  payout_usd: number; // realized payout if settlement lands in this band
}

export interface SimPosition {
  sim_id: string;
  owner: string;
  product: SimProduct;
  label: string;
  name: string;
  premium_usd: number;
  max_payout_usd: number;
  oracle_id: string | null;
  forward_usd: number; // forward at open (fallback settlement basis)
  expiry_ms: number | null;
  bands: SimBand[];
  /** Present only for the canonical mUSDC discrete-observation autocall. */
  autocall_terms?: AutocallTerms | null;
  status: 'pending' | 'open' | 'settling' | 'settled';
  open_digest: string | null;
  settle_digest: string | null;
  payoff_usd: number | null;
  settlement_forward_usd?: number; // realized forward used at first settle (for replay)
  settlement_started_at?: number;
  opened_at: number;
}

// ---- store (in-memory + JSON persistence so positions survive a dev restart) --
const STORE_FILE = statePath('.sim-positions.json');
const PENDING_TTL_MS = 15 * 60_000;
const positions = new Map<string, SimPosition>();
let loaded = false;
let loadPromise: Promise<void> | null = null;
let persistQueue: Promise<void> = Promise.resolve();

async function load(): Promise<void> {
  if (loaded) return;
  // Memoize the in-flight load PROMISE so concurrent cold-start callers all await
  // the SAME read and never observe an empty Map mid-load. `loaded` flips to true
  // only AFTER the read completes, so the fast-path above is correct thereafter.
  loadPromise ??= (async () => {
    try {
      const raw = await fs.readFile(STORE_FILE, 'utf8');
      const arr = JSON.parse(raw) as SimPosition[];
      for (const p of arr) positions.set(p.sim_id, p);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    loaded = true;
  })();
  await loadPromise;
}
async function persist(): Promise<void> {
  const payload = JSON.stringify([...positions.values()], null, 0);
  const tmp = `${STORE_FILE}.${process.pid}.tmp`;
  const write = persistQueue
    .catch(() => undefined)
    .then(async () => {
      await fs.writeFile(tmp, payload);
      await fs.rename(tmp, STORE_FILE);
    });
  persistQueue = write;
  await write;
}

let counter = 0;
function newSimId(): string {
  counter += 1;
  return `${Date.now().toString(36)}${counter.toString(36)}`;
}

// ---- open ---------------------------------------------------------------------
export interface SimOpenArgs {
  owner: string;
  product: SimProduct;
  name: string;
  premium_usd: number;
  max_payout_usd: number;
  oracle_id?: string | null;
  forward_usd: number;
  expiry_ms?: number | null;
  bands: SimBand[];
  autocall_terms?: AutocallTerms | null;
}

function validateSimOpenArgs(args: SimOpenArgs): void {
  if (!/^0x[0-9a-fA-F]{64}$/.test(args.owner)) throw new Error('owner must be a 32-byte Sui address');
  if (!Number.isFinite(args.premium_usd) || !(args.premium_usd > 0)) throw new Error('premium_usd must be positive');
  if (!Number.isFinite(args.max_payout_usd) || !(args.max_payout_usd > 0)) throw new Error('max_payout_usd must be positive');
  if (args.max_payout_usd > args.premium_usd * MAX_PAYOFF_MULTIPLE + 1e-9) {
    throw new Error(`max_payout_usd may not exceed premium_usd * ${MAX_PAYOFF_MULTIPLE}`);
  }
  if (!Number.isFinite(args.forward_usd) || args.forward_usd < 0) throw new Error('forward_usd must be non-negative');
  if (args.expiry_ms != null && (!Number.isFinite(args.expiry_ms) || args.expiry_ms <= Date.now())) {
    throw new Error('expiry_ms must be a finite future timestamp in milliseconds');
  }

  const sorted = [...args.bands].sort((a, b) => a.lower_usd - b.lower_usd || a.higher_usd - b.higher_usd);
  for (let index = 0; index < sorted.length; index++) {
    const band = sorted[index];
    if (![band.lower_usd, band.higher_usd, band.payout_usd].every(Number.isFinite)) {
      throw new Error(`band ${index} has non-finite lower/higher/payout`);
    }
    if (!(band.lower_usd < band.higher_usd)) throw new Error(`band ${index} is inverted or degenerate`);
    if (band.payout_usd < 0) throw new Error(`band ${index} has a negative payout`);
    if (band.payout_usd > args.max_payout_usd + 1e-9) throw new Error(`band ${index} payout exceeds max_payout_usd`);
    if (index > 0 && band.lower_usd < sorted[index - 1].higher_usd) {
      throw new Error(`band ${index} overlaps the preceding terminal band`);
    }
  }
}

/** Build the user-signed mUSDC deposit (premium → Vault<MOCK_USDC>, labelled). */
export async function prepareSimOpen(
  args: SimOpenArgs,
): Promise<PreparedTx & { sim_id: string; label: string }> {
  await load();
  validateSimOpenArgs(args);
  const staleBefore = Date.now() - PENDING_TTL_MS;
  let pruned = false;
  for (const [id, position] of positions) {
    if (position.status === 'pending' && position.opened_at < staleBefore) {
      positions.delete(id);
      pruned = true;
    }
  }
  if (pruned) await persist();
  const simId = newSimId();
  const label = `sim:${args.product}:${simId}`;
  const pos: SimPosition = {
    sim_id: simId,
    owner: args.owner,
    product: args.product,
    label,
    name: args.name,
    premium_usd: args.premium_usd,
    max_payout_usd: args.max_payout_usd,
    oracle_id: args.oracle_id ?? null,
    forward_usd: args.forward_usd,
    expiry_ms: args.expiry_ms ?? null,
    bands: args.bands ?? [],
    autocall_terms: args.autocall_terms ?? null,
    status: 'pending',
    open_digest: null,
    settle_digest: null,
    payoff_usd: null,
    opened_at: Date.now(),
  };
  const prepared = await prepareDeposit({ owner: args.owner, amount_usdc: args.premium_usd, label });
  positions.set(simId, pos);
  await persist();
  return { ...prepared, sim_id: simId, label };
}

/** Mark a sim position opened once the user's deposit confirms.
 *  A position only ever leaves 'pending' on a REAL on-chain digest — never on a
 *  rejected/abandoned signature — so the portfolio's status === 'open' filter can
 *  trust that an "open" row corresponds to a confirmed deposit. We also refuse to
 *  re-open an already-settled position. */
export async function confirmSimOpen(simId: string, digest: string): Promise<SimPosition> {
  await load();
  const pos = positions.get(simId);
  if (!pos) throw new Error(`unknown sim position ${simId}`);
  if (!digest || !digest.trim()) throw new Error('a real settlement digest is required to confirm');
  if (pos.status === 'settled') throw new Error(`sim position ${simId} is already settled`);
  if (pos.status === 'settling') throw new Error(`sim position ${simId} is awaiting settlement reconciliation`);
  // Idempotent: a repeat /confirm with the SAME digest is a no-op replay; a
  // different digest on an already-confirmed position is rejected.
  if (pos.open_digest && pos.open_digest !== digest) {
    throw new Error(`sim position ${simId} already confirmed with a different digest`);
  }
  if (pos.status === 'open' && pos.open_digest === digest) return pos;

  // SECURITY: verify on-chain that THIS position's premium was actually deposited
  // into the vault under THIS position's label. Without this, anyone could flip a
  // position to 'open' with a junk digest and then settle to free-mint the band
  // payoff (the operator-signed mint in settleSim) without ever paying the premium.
  const c = await confirmDigest(digest, pos.owner, 'mUSDC');
  if (!c.ok) {
    throw new Error('deposit digest did not resolve to a successful on-chain transaction');
  }
  if (decodeVaultLabel(c.event?.label) !== pos.label) {
    throw new Error('deposit digest does not match this position (vault deposit label mismatch)');
  }
  // The owner must have actually spent at least the premium (delta is negative for
  // a deposit). Guards against pointing /confirm at an unrelated or smaller tx.
  if (c.usdc_delta == null || c.usdc_delta > -(pos.premium_usd) + 1e-6) {
    throw new Error('deposit digest does not show a premium outflow matching this position');
  }

  pos.status = 'open';
  pos.open_digest = digest;
  await persist();
  return pos;
}

// ---- settle -------------------------------------------------------------------
/**
 * Resolve an authoritative terminal settlement. Products without an oracle may
 * use their recorded forward, but an oracle-backed position must wait for the
 * oracle's final settlement instead of substituting its opening mark.
 */
async function settlementForward(pos: SimPosition): Promise<number> {
  if (!pos.oracle_id) return pos.forward_usd;
  const oracles = await predictServer.predictOracles().catch(() => predictServer.oracles());
  const price = authoritativeSettlementUsd(oracles, pos.oracle_id);
  if (price != null) return price;
  throw new Error(`position oracle ${pos.oracle_id} is awaiting authoritative settlement`);
}

async function resolveAutocallPosition(pos: SimPosition): Promise<{
  payout: number;
  settlement: number;
  lifecycle: 'called' | 'matured';
}> {
  const terms = pos.autocall_terms;
  if (!terms) throw new Error('autocall terms are missing');
  const oracles = await predictServer.predictOracles().catch(() => predictServer.oracles());
  const withSettlements: AutocallTerms = {
    ...terms,
    observations: terms.observations.map((observation) => {
      return {
        ...observation,
        settlement_usd: authoritativeSettlementUsd(oracles, observation.oracle_id),
      };
    }),
  };
  const decision = resolveAutocall(withSettlements, Date.now());
  if (decision.status === 'pending') {
    throw new Error(`autocall is not yet at an observation; next observation is ${decision.next_observation_ms}`);
  }
  if (decision.status === 'awaiting_settlement') {
    throw new Error(`autocall observation ${decision.observation_ms} is awaiting oracle settlement`);
  }
  return {
    payout: decision.payout_usd,
    settlement: decision.settlement_usd,
    lifecycle: decision.status,
  };
}

/** Realized payoff = the single band the settlement forward lands in (settlement
 *  resolves to exactly one band; if outside every band, the structure expires
 *  worthless). Band interval is (lower, higher] — lower-EXCLUSIVE, upper-INCLUSIVE
 *  — to match the on-chain strip's Normal-mass convention (structured.ts: "mass in
 *  (lower, higher]"). Using [lower, higher) here settled a DIFFERENT band than the
 *  dUSDC rail exactly at a tick boundary, breaking mUSDC≡dUSDC parity. */
function realizedPayoff(pos: SimPosition, fwd: number): number {
  for (const b of pos.bands) {
    if (fwd > b.lower_usd && fwd <= b.higher_usd) return Math.max(0, b.payout_usd);
  }
  return 0;
}

export interface SimSettleResult {
  sim_id: string;
  settlement_forward_usd: number;
  payoff_usd: number;
  premium_usd: number;
  pnl_usd: number;
  mint_digest: string | null;
  explorer_url: string | null;
  lifecycle?: 'called' | 'matured' | 'terminal';
}

// In-flight settle reservations — closes the TOCTOU double-mint window in settleSim:
// the status flag is only persisted AFTER the async mint, so two concurrent settles
// would both pass the status check and mint twice. This Set makes the reservation
// synchronous (a concurrent caller throws 'in progress'; once the first completes and
// persists status='settled', a later call replays the booked result).
const settlingSim = new Set<string>();

/** Compute the payoff and mint exactly that much mUSDC to the holder. */
export async function settleSim(simId: string): Promise<SimSettleResult> {
  await load();
  const pos = positions.get(simId);
  if (!pos) throw new Error(`unknown sim position ${simId}`);
  // Idempotent: never re-mint an already-settled position (a double-settle would
  // pay the holder twice). Replay the booked result instead.
  if (pos.status === 'settled') {
    return {
      sim_id: simId,
      settlement_forward_usd: pos.settlement_forward_usd ?? pos.forward_usd,
      payoff_usd: pos.payoff_usd ?? 0,
      premium_usd: pos.premium_usd,
      pnl_usd: (pos.payoff_usd ?? 0) - pos.premium_usd,
      mint_digest: pos.settle_digest ?? null,
      explorer_url: null,
    };
  }
  if (pos.status === 'settling') {
    throw new Error(`settlement for ${simId} is awaiting operator reconciliation`);
  }
  // SECURITY: only a verified-open position (real premium deposit confirmed by
  // confirmSimOpen) may ever drive the operator-signed mint below.
  if (pos.status !== 'open' || !pos.open_digest) {
    throw new Error('position is not open/confirmed; settlement unavailable');
  }
  if (settlingSim.has(simId)) throw new Error(`settlement already in progress for ${simId}`);
  settlingSim.add(simId);
  try {
    let fwd: number;
    let realized: number;
    let lifecycle: SimSettleResult['lifecycle'] = 'terminal';
    if (pos.autocall_terms) {
      const call = await resolveAutocallPosition(pos);
      fwd = call.settlement;
      realized = call.payout;
      lifecycle = call.lifecycle;
    } else {
      // EARLY-CLAIM GUARD: ordinary terminal products settle only at expiry. An
      // autocall is allowed to settle at its first eligible observation above.
      if (pos.expiry_ms != null && Date.now() < pos.expiry_ms) {
        throw new Error('position is not yet at expiry; settlement is unavailable until expiry');
      }
      fwd = await settlementForward(pos);
      realized = realizedPayoff(pos, fwd);
    }
    // Cap at max_payout, at a sane multiple of the (verified) premium, floor at 0,
    // and never let a non-finite value reach the mint.
    const premiumCap = pos.premium_usd > 0 ? pos.premium_usd * MAX_PAYOFF_MULTIPLE : Infinity;
    const declaredCap = Number.isFinite(pos.max_payout_usd) ? pos.max_payout_usd : Infinity;
    const cap = Math.min(declaredCap, premiumCap);
    const payoff = Math.max(0, Math.min(realized, cap));
    if (!Number.isFinite(payoff)) throw new Error(`settlement produced a non-finite payoff for ${simId}`);
    // Persist the mint intent before calling the operator signer. If the process
    // dies after execution but before booking the digest, restart recovery fails
    // closed in `settling` instead of issuing a second mint.
    pos.status = 'settling';
    pos.payoff_usd = payoff;
    pos.settlement_forward_usd = fwd;
    pos.settlement_started_at = Date.now();
    await persist();
    let mintDigest: string | null = null;
    let explorer: string | null = null;
    if (payoff > 0) {
      const r = await mintMockUsdc(pos.owner, payoff);
      mintDigest = r.digest;
      explorer = r.explorer_url;
    }
    pos.status = 'settled';
    pos.payoff_usd = payoff;
    pos.settle_digest = mintDigest;
    pos.settlement_forward_usd = fwd; // persist the realized forward so replay reports it, not the open forward
    await persist();
    return {
      sim_id: simId,
      settlement_forward_usd: fwd,
      payoff_usd: payoff,
      premium_usd: pos.premium_usd,
      pnl_usd: payoff - pos.premium_usd,
      mint_digest: mintDigest,
      explorer_url: explorer,
      lifecycle,
    };
  } finally {
    settlingSim.delete(simId);
  }
}

export async function listSimPositions(owner: string): Promise<SimPosition[]> {
  await load();
  return [...positions.values()]
    .filter((p) => p.owner.toLowerCase() === owner.toLowerCase())
    .sort((a, b) => b.opened_at - a.opened_at);
}

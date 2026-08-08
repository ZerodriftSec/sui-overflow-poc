/**
 * Volatility product engine — trade BTC realized-vs-implied vol like an
 * equity-derivatives desk, synthesized from DeepBook Predict range strips.
 *
 *   Long vol  = a BARBELL strip (wings-heavy) → long gamma, pays on big moves.
 *   Short vol = a PIN strip (center-heavy)    → short gamma, pays if BTC stays.
 *
 * Both are real strips minted through `previewStrip` (the override `weights`
 * reshape the payout while reusing the identical on-chain MM pricing). Greeks
 * (Δ/Γ/Vega/Θ) are computed on the synthesized payout under a Normal(forward,σ)
 * measure — closed-form Δ/Γ, finite-difference Vega/Θ. The codebase's normal
 * helpers (tranching.ts/structured.ts) are module-local, so we keep our own.
 */
import type { StripQuote } from './structured';

export type VolSide = 'long' | 'short';

// The protocol only mints bands whose per-contract ask sits inside [2%,98%]
// (structured.ts MIN/MAX_MINTABLE_PRICE). A symmetric strip whose wings span too
// many σ pushes its outermost buckets below the 2% mint floor, so they silently
// drop — collapsing the intended delta-neutral structure to a one-sided
// (directional) strip. tightenSpanForCollapse narrows the span until the wings
// clear that floor again.
// Don't tighten a symmetric strip past this — below it the wings stop being OTM and
// the structure degenerates toward a straddle. Matches the audit's ~2.0σ floor.
const MIN_SYMMETRIC_SPAN = 2.0;

// --- standard normal (Abramowitz & Stegun 7.1.26), matching structured.ts ---
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
function Phi(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}
function phi(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Per-bucket sizing weights for a vol strip across `n` ordered buckets.
 *  long  → barbell: weight grows toward the wings (distance from center).
 *  short → pin:     weight grows toward the center.
 * A small floor keeps every band funded so the strip stays tradeable.
 */
export function volWeights(n: number, side: VolSide): number[] {
  const center = (n - 1) / 2;
  const maxd = Math.max(center, 1);
  return Array.from({ length: n }, (_, i) => {
    const d = Math.abs(i - center) / maxd; // 0 = center, 1 = wings
    return 0.12 + (side === 'long' ? d : 1 - d);
  });
}

/** The four canonical vol structures, plus 'custom' = a user-sculpted strip. */
export type VolStrategy = 'straddle' | 'strangle' | 'butterfly' | 'condor' | 'custom';

export interface StrategyProfile {
  strategy: VolStrategy;
  side: VolSide;
  label: string;
  thesis: string;
  /** strip half-width in σ; wider = more OTM coverage. */
  spanSigma: number;
  /** per-bucket sizing weights (length n). */
  weights: number[];
  /** True for structures the user expects to be delta-neutral (straddle/strangle/
   *  butterfly/condor). A one-sided bucket drop on a `symmetric` preset is a
   *  correctness bug (the strip secretly becomes directional), so the route must
   *  auto-tighten the span / symmetrize rather than ship the collapsed shape. */
  symmetric: boolean;
}

/**
 * Map a structured vol strategy to its strip geometry (side, span, per-bucket
 * weights). All four are real option structures expressed as DeepBook range
 * strips:
 *   straddle  — long gamma, ATM-centered wings (pays on any decent move)
 *   strangle  — long gamma, OTM-only wings (cheaper, pays on a large move)
 *   butterfly — short gamma, tight center (pays if BTC pins the forward)
 *   condor    — short gamma, wide center plateau (pays across a range)
 */
export function strategyProfile(strategy: VolStrategy, n: number): StrategyProfile {
  const center = (n - 1) / 2;
  const maxd = Math.max(center, 1);
  const dist = (i: number) => Math.abs(i - center) / maxd; // 0 center … 1 wings
  let side: VolSide;
  let spanSigma: number;
  let label: string;
  let thesis: string;
  let w: (d: number) => number;
  switch (strategy) {
    case 'strangle':
      // 2.4σ (was 3.0): at 3.0 the outermost wing bucket carries ~1.1% Normal mass,
      // below the protocol's 2% mint floor, so the upper wing priced untradeable
      // under SVI right-skew and was silently dropped — turning the symmetric long-
      // gamma strangle into a one-sided bearish strip. 2.4σ keeps every wing bucket
      // ≳2.8% (above the floor with skew headroom) while staying wider/more-OTM than
      // the 2.2σ straddle, so it remains a genuine strangle. See tightenSpanForCollapse.
      side = 'long'; spanSigma = 2.4; label = 'Strangle';
      thesis = 'Long gamma, OTM wings — cheap, pays on a large BTC move';
      w = (d) => (d < 0.34 ? 0.05 : 0.12 + d * 1.25);
      break;
    case 'butterfly':
      side = 'short'; spanSigma = 1.7; label = 'Butterfly';
      thesis = 'Short gamma, pinned — pays if BTC stays near the forward';
      w = (d) => 0.12 + (1 - d) * 1.4;
      break;
    case 'condor':
      side = 'short'; spanSigma = 2.6; label = 'Iron Condor';
      thesis = 'Short gamma, ranged — pays across a wide middle band';
      w = (d) => (d < 0.55 ? 0.85 + (0.55 - d) : 0.06);
      break;
    case 'straddle':
    default:
      side = 'long'; spanSigma = 2.2; label = 'Straddle';
      thesis = 'Long gamma, ATM — gains as BTC moves off the forward';
      w = (d) => 0.15 + d * 1.05;
      break;
  }
  const weights = Array.from({ length: n }, (_, i) => Math.max(0, w(dist(i))));
  // All four named presets are intended delta-neutral structures, so a one-sided
  // wing drop is a collapse the route must repair (auto-tighten or symmetrize).
  return { strategy, side, label, thesis, spanSigma, weights, symmetric: true };
}

/**
 * Build a profile from a user-sculpted weight vector (the Advanced bespoke
 * builder). The weights ARE the payout shape across the strip's strike bands;
 * `side` (long/short gamma) is INFERRED from where the mass sits — wings-heavy is
 * long gamma (pays on a move), center-heavy is short gamma (pays if BTC stays).
 * Prices through the identical `previewStrip` MM path as the canonical presets.
 */
export function customVolProfile(weights: number[], spanSigma: number): StrategyProfile {
  const w = weights.map((x) => (Number.isFinite(x) ? Math.max(0, x) : 0));
  const n = w.length;
  const center = (n - 1) / 2;
  const maxd = Math.max(center, 1);
  // Long gamma (a convex, delta-neutral payoff) requires a genuine BARBELL — heavy
  // mass in BOTH wings. The old `wing >= core` summed both wings, so a ONE-SIDED
  // (directional) ramp with all its mass in a single wing counted as "wings heavy →
  // long" while its realized strip greeks are short/short-vega — a label that
  // contradicts the priced payoff. Split the wings and require BOTH to outweigh the
  // core, so a one-sided sculpt is correctly classified short/directional.
  let leftWing = 0, rightWing = 0, core = 0;
  for (let i = 0; i < n; i++) {
    const dn = Math.abs(i - center) / maxd;
    if (dn > 0.5) { if (i < center) leftWing += w[i]; else rightWing += w[i]; }
    else core += w[i];
  }
  const side: VolSide = Math.min(leftWing, rightWing) > core ? 'long' : 'short';
  return {
    strategy: 'custom',
    side,
    label: 'Custom structure',
    thesis: side === 'long'
      ? 'Long gamma — your sculpted payout gains as BTC moves off the forward'
      : 'Short gamma — your sculpted payout pays if BTC stays in your band',
    spanSigma,
    weights: w,
    // A user-sculpted strip is intentionally whatever shape they drew — possibly
    // one-sided — so it must NOT be auto-symmetrized/tightened against its author.
    symmetric: false,
  };
}

/** True iff this priced strip dropped any bucket (priced outside [2%,98%] and so
 *  untradeable). For a `symmetric` preset this means the structure collapsed to a
 *  one-sided, directional strip and must be repaired before it is surfaced. */
export function stripCollapsed(strip: StripQuote): boolean {
  // untradeable_weight_fraction is the share of requested sizing weight that was
  // dropped; >0 ⇒ at least one intended bucket is gone. Use a dust epsilon so
  // grid-snap rounding noise doesn't trip the guard.
  return (strip.untradeable_weight_fraction ?? 0) > 1e-9;
}

/**
 * Auto-tighten step (audit fix B3, part 1, option a — the PREFERRED repair, since
 * it preserves both wings). When a symmetric preset's strip dropped a bucket
 * (`stripCollapsed`), return a narrower span to re-price with: the outer buckets
 * move inward, gaining Normal mass until their per-contract ask clears the 2% mint
 * floor and every intended band is tradeable again.
 *
 * Caller usage (in routes/vol.ts /quote): after the first previewStrip, while
 * `profile.symmetric && stripCollapsed(strip)` and the span is still above the
 * floor, set `span = tightenSpanForCollapse(span)` and re-price; stop when the
 * strip no longer collapses or the floor is reached. Returns `span` unchanged once
 * at MIN_SYMMETRIC_SPAN so the loop terminates (then fall back to symmetrizeStrip).
 */
export function tightenSpanForCollapse(spanSigma: number, step = 0.2): number {
  if (!(spanSigma > MIN_SYMMETRIC_SPAN)) return spanSigma; // already at/below floor
  return Math.max(MIN_SYMMETRIC_SPAN, spanSigma - Math.max(step, 1e-3));
}

// Tradeable-bucket predicate shared by the symmetrize fallback. A band survives
// only if it was minted (tradeable) with a positive quantity; a dropped wing has
// quantity 0 and tradeable=false (see structured.ts previewStrip).
function bucketLive(b: StripQuote['buckets'][number]): boolean {
  return b.tradeable && Number(b.quantity) > 0;
}

/**
 * Symmetrize fallback (audit fix B3, part 1, option b — the LAST-RESORT repair used
 * only if auto-tighten cannot recover every wing at the span floor). For each band
 * dropped on one wing, also zero its mirror band so the surfaced strip stays
 * delta-neutral instead of secretly directional. This MUTATES the structure (drops
 * the still-tradeable mirror wing) rather than the geometry, so prefer
 * tightenSpanForCollapse first — this only guarantees the user never receives a
 * one-sided strip mislabeled as a neutral preset.
 *
 * Returns a NEW StripQuote (caller must recompute Greeks on it via computeVolGreeks,
 * since zeroing a band changes delta/gamma/value). Pure: does not mutate `strip`.
 */
export function symmetrizeStrip(strip: StripQuote): StripQuote {
  const n = strip.buckets.length;
  const live = strip.buckets.map(bucketLive);
  // A bucket must be dropped if EITHER it or its mirror (i ↔ n-1-i) was dropped, so
  // the kept set is symmetric about the center.
  const keep = strip.buckets.map((_, i) => live[i] && live[n - 1 - i]);
  let droppedWeight = 0;
  let totalWeight = 0;
  const buckets = strip.buckets.map((b, i) => {
    totalWeight += b.weight;
    if (keep[i]) return b;
    droppedWeight += b.weight;
    if (!bucketLive(b)) return b; // already dropped — leave as-is
    // Zero this newly-dropped mirror band so the strip stays symmetric/neutral.
    return {
      ...b,
      tradeable: false,
      quantity: '0',
      mint_cost_raw: '0',
      redeem_value_raw: '0',
      max_payout_raw: '0',
      slippage_raw: '0',
      spread_raw: '0',
      avg_price: 0,
    };
  });
  // Re-aggregate the totals affected by zeroing the mirror wing so downstream
  // consumers (cost/payout/EV) stay consistent with the symmetrized buckets.
  const sum = (key: 'mint_cost_raw' | 'redeem_value_raw' | 'max_payout_raw' | 'slippage_raw') =>
    buckets.reduce((s, b) => s + BigInt(b[key]), 0n);
  const totalMint = sum('mint_cost_raw');
  const totalRedeem = sum('redeem_value_raw');
  const totalPayout = sum('max_payout_raw');
  const maxPayout = buckets.reduce((m, b) => (BigInt(b.max_payout_raw) > m ? BigInt(b.max_payout_raw) : m), 0n);
  // Recompute EV = Σ P(band)·payout − cost under the strip's own Normal(μ,σ) (USD
  // units; z-scores are scale-invariant, matching previewStrip's raw-unit formula),
  // so EV reflects the symmetrized payout rather than the pre-collapse one.
  const sig = strip.sigma_usd > 0 ? strip.sigma_usd : 1;
  const evNum = buckets.reduce((s, b) => {
    const pNorm = Phi((b.higher_usd - strip.mu_usd) / sig) - Phi((b.lower_usd - strip.mu_usd) / sig);
    return s + pNorm * Number(b.max_payout_raw); // payout = in-band quantity (raw 1e6)
  }, 0);
  const ev = BigInt(Math.round(evNum)) - totalMint;
  return {
    ...strip,
    buckets,
    total_cost_raw: totalMint.toString(),
    total_redeem_value_raw: totalRedeem.toString(),
    total_max_payout_raw: totalPayout.toString(),
    realized_max_payout_raw: maxPayout.toString(),
    total_slippage_raw: sum('slippage_raw').toString(),
    round_trip_spread_raw: (totalMint > totalRedeem ? totalMint - totalRedeem : 0n).toString(),
    expected_value_raw: ev.toString(),
    untradeable_weight_fraction: totalWeight > 0 ? droppedWeight / totalWeight : 0,
  };
}

export interface VolGreeks {
  /** ∂(position value)/∂(forward) — the BTC-equivalent delta to hedge. */
  delta_btc: number;
  /** ∂delta/∂forward — convexity (positive = long gamma). */
  gamma: number;
  /** $ P&L per +1 vol point (1% IV). Positive = long vega. */
  vega_usd: number;
  /** $ P&L per day of time decay. Negative for long vol, positive for short. */
  theta_usd_day: number;
  /** Mark-to-model value of the synthesized payout. */
  position_value_usd: number;
}

/**
 * Greeks of the synthesized vol strip under Normal(forward, σ_usd).
 * Each tradeable band [a,b] holds q contracts ($1 each) and is worth
 * q·(Φ(zb)−Φ(za)). Σ over bands gives value; Δ/Γ are its forward derivatives;
 * Vega/Θ come from re-evaluating at bumped σ (σ = forward·IV·√T).
 */
export function computeVolGreeks(strip: StripQuote, forwardUsd: number, sigmaUsd: number, tYears: number): VolGreeks {
  const bands = strip.buckets.filter((b) => b.tradeable && Number(b.quantity) > 0);
  const valueAt = (sig: number): number => {
    let v = 0;
    for (const b of bands) {
      const q = Number(b.quantity) / 1e6;
      v += q * (Phi((b.higher_usd - forwardUsd) / sig) - Phi((b.lower_usd - forwardUsd) / sig));
    }
    return v;
  };
  let delta = 0;
  let gamma = 0;
  for (const b of bands) {
    const q = Number(b.quantity) / 1e6;
    const za = (b.lower_usd - forwardUsd) / sigmaUsd;
    const zb = (b.higher_usd - forwardUsd) / sigmaUsd;
    // ∂P/∂F = (φ(za) − φ(zb))/σ ; ∂²P/∂F² = (za·φ(za) − zb·φ(zb))/σ²
    delta += (q * (phi(za) - phi(zb))) / sigmaUsd;
    gamma += (q * (za * phi(za) - zb * phi(zb))) / (sigmaUsd * sigmaUsd);
  }
  // Vega / Theta via finite-difference on σ_usd, mapped to IV/time.
  const h = Math.max(sigmaUsd * 0.02, 1e-6);
  const dV_dSigma = (valueAt(sigmaUsd + h) - valueAt(sigmaUsd - h)) / (2 * h);
  const sqrtT = Math.sqrt(Math.max(tYears, 1e-9));
  // σ = F·IV·√T  ⇒  dσ per +1% IV = F·√T·0.01 ; dσ per −1 day = −(σ/2T)/365
  const vega = dV_dSigma * forwardUsd * sqrtT * 0.01;
  const theta = tYears > 0 ? dV_dSigma * (-(sigmaUsd / (2 * tYears)) / 365) : 0;
  const value = valueAt(sigmaUsd);
  // Report the RAW model greeks — no value-based squash. A near-expiry option
  // legitimately has a huge per-day theta (∝ 1/T) and small σ-vega (∝ √T); that
  // IS its true risk, and clamping it fabricates numbers. (A prior tanh squash
  // shared cap=|value| across vega AND theta, which saturated theta to exactly
  // ±position_value on the live sub-hour oracles and biased/clipped vega even on
  // sane tenors — it mutated the only greeks any consumer sees.) The UI suppresses
  // the degenerate per-day/per-pt greeks for sub-day tenors instead; delta/gamma
  // (the hedge inputs) must stay exact.
  const finite = (x: number) => (Number.isFinite(x) ? x : 0);
  return { delta_btc: finite(delta), gamma: finite(gamma), vega_usd: finite(vega), theta_usd_day: finite(theta), position_value_usd: value };
}

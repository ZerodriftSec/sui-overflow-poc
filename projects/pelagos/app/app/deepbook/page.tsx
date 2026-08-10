"use client";

// ---------------------------------------------------------------------------
// DeepBook — structured strategies built on DeepBook, plus Protected Notes.
//
// Two linked surfaces, switched by an in-page tab:
//   1. Strategies     — 7 prebuilt DeepBook range-strip strategies. Pick one +
//                       a notional → live on-chain quote (priced via DeepBook's
//                       get_range_trade_amounts), a payoff shape, greeks, max
//                       loss, and a Deploy CTA that routes the strip on-chain.
//   2. Earn Yield      — real DeepBook PLP supply, with optional live range hedges.
//   3. Structured Notes — fully-funded PLP reserve + range premium, plus a
//                         discrete-observation mUSDC autocall lifecycle.
//
// Basic mode  = clean, legible: tagged strategy cards → simple quote + Deploy;
//               note preset picker → floor / expected / best + Deploy.
// Advanced mode = the exact deployment: full strip buckets (range bands, qty,
//               cost, payout, slippage), greeks, on-chain oracle/expiry routing,
//               and for notes the full yield-sleeve breakdown + deployed strip.
//
// DeepBook prices, PLP NAV, utilization, and risk capacity are live on-chain.
// mUSDC canonical payoffs are generated server-side from those same quote marks.
// ---------------------------------------------------------------------------

import React, { useEffect, useRef, useState } from "react";
import { Header, PageFrame } from "../_components/Header";
import { C, FD, FM, FS, EASE } from "../_lib/tokens";
import { useMode } from "../_lib/mode";
import { friendlyWalletError } from "../_lib/chain";
import { useWalletSigner, useDusdcBalance, useUsdcBalance } from "../_lib/wallet-bridge";
import { ConnectModal } from "@mysten/dapp-kit";
import { ResultLine } from "../_components/strip-products";
import {
  ensureManager,
  prepareOpenStrip,
  prepareLpWithdraw,
  prepareManagerWithdraw,
  confirmPredict,
  usd,
} from "../_lib/predict-strip-client";
import {
  fetchDeepBookStrategies,
  fetchDeepBookExpiries,
  quoteDeepBookStrategy,
  fetchYieldStrategies,
  quoteYieldStrategy,
  fetchYieldAccount,
  prepareYieldOpen,
  prepareYieldRangeExit,
  fetchNotePresets,
  quoteNote,
  prepareNoteOpen,
  type DeepBookStrategy,
  type DeepBookExpiry,
  type DeepBookQuote,
  type DeepBookBucket,
  type YieldStrategy,
  type YieldQuote,
  type YieldAccount,
  type TerminalBand,
  type NotePreset,
  type NoteQuote,
} from "../_lib/v2-clients";
import { CurrencySelect, type Currency } from "../_components/CurrencySelect";
import { simOpen, simConfirm } from "../_lib/sim-client";

// ───────────────────────── formatters ─────────────────────────
const money = (v: number, d = 0) => {
  const r = Number(v.toFixed(d));
  const neg = r < 0;
  return `${neg ? "-" : ""}$${Math.abs(r).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};
const money2 = (v: number) => money(v, 2);
const pctSigned = (v: number) => {
  const r = Number(v.toFixed(2));
  return r > 0 ? `+${r.toFixed(2)}%` : `${r.toFixed(2)}%`;
};
// raw (6-dp dUSDC) → ui number
const ui = (raw: string) => Number(raw) / 1e6;
const RISK_COLOR: Record<string, string> = {
  low: C.green,
  med: C.amber,
  medium: C.amber,
  high: C.red,
};
// Range-market direction → accent, one-line label, and glyph. up/down are
// semantic (directional gain/loss); pin/range/break use the accent palette.
const DIR_COLOR: Record<string, string> = {
  up: C.green, down: C.red, pin: C.tealLight, range: C.teal, break: C.violet,
};
const DIR_LABEL: Record<string, string> = {
  up: "Directional · targets a higher band",
  down: "Directional · targets a lower band",
  pin: "Level · sits on the forward",
  range: "Range · pays inside a band",
  break: "Range · pays on a move either way",
};
// Plain-English "you win when…" per range-market direction — the Basic outcome line.
const OUTCOME_IF: Record<string, string> = {
  up: "BTC settles in the higher band",
  down: "BTC settles in the lower band",
  pin: "BTC finishes near the forward",
  range: "BTC stays inside the band",
  break: "BTC breaks out either way",
};
function DirectionIcon({ dir, color, w = 22, h = 16 }: { dir: string; color: string; w?: number; h?: number }) {
  const P: Record<string, string> = {
    up: "M2 12 L6 7 L10 9 L16 3",
    down: "M2 3 L6 8 L10 6 L16 12",
    pin: "M2 12 L9 3 L16 12",
    range: "M3 3 L3 13 M15 3 L15 13 M3 8 L15 8",
    break: "M2 12 L6 5 L8 9 L10 9 L12 5 L16 12",
  };
  return (
    <svg width={w} height={h} viewBox="0 0 18 14" fill="none" style={{ flexShrink: 0 }}>
      <path d={P[dir] ?? P.pin} stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <span className="db-tag" style={{ color, borderColor: `${color}44`, background: `${color}12` }}>
      {label}
    </span>
  );
}

// Basic mode shows a curated, DIVERSE trio — one level (pin), one up, one down —
// so the three cards read as distinct bets, not three shades of the same thing.
function basicTrio(all: DeepBookStrategy[]): DeepBookStrategy[] {
  const pick = (d: string) => all.find((s) => s.direction === d);
  const trio = [pick("pin"), pick("up"), pick("down")].filter(Boolean) as DeepBookStrategy[];
  return trio.length >= 3 ? trio : all.slice(0, 3);
}

// ═══════════════════════════════════════════════════════════════
export default function DeepBookPage() {
  const { mode } = useMode();
  const wallet = useWalletSigner();
  const [tab, setTab] = useState<"strategies" | "yield" | "notes">("strategies");

  return (
    <>
      <Header />
      <PageFrame wide>
        <div className="db">
          {/* header */}
          <div className="db-head">
            <div>
              <div className="db-eyebrow">STRUCTURED STRATEGIES · BUILT ON DEEPBOOK</div>
              <h1>Range Strips</h1>
              <p>
                Directional and level bets on where BTC settles — each a shaped strip priced against DeepBook&apos;s
                implied distribution, provide counterparty liquidity through PLP, or combine funded reserves with terminal barriers and discrete observations.
              </p>
            </div>
            <div className="db-tabs" role="tablist" aria-label="Surface">
              <button role="tab" aria-selected={tab === "strategies"} className={tab === "strategies" ? "is-on" : ""} onClick={() => setTab("strategies")}>
                Buy Strips
              </button>
              <button role="tab" aria-selected={tab === "yield"} className={tab === "yield" ? "is-on" : ""} onClick={() => setTab("yield")}>
                Earn Yield
              </button>
              <button role="tab" aria-selected={tab === "notes"} className={tab === "notes" ? "is-on" : ""} onClick={() => setTab("notes")}>
                Protected Notes
              </button>
            </div>
          </div>

          {tab === "strategies" && <StrategiesSurface wallet={wallet} mode={mode} />}
          {tab === "yield" && <YieldSurface wallet={wallet} mode={mode} />}
          {tab === "notes" && <NotesSurface wallet={wallet} mode={mode} />}
        </div>
      </PageFrame>
      <style jsx global>{DB_CSS}</style>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
//  STRATEGIES SURFACE
// ═══════════════════════════════════════════════════════════════
function StrategiesSurface({ wallet, mode }: { wallet: ReturnType<typeof useWalletSigner>; mode: "basic" | "advanced" }) {
  const [strategies, setStrategies] = useState<DeepBookStrategy[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Match the backend's smallest quote bucket and the managed testnet vault.
  const [notional, setNotional] = useState("10");
  const [expiryPref, setExpiryPref] = useState<"near" | "mid" | "far">("mid");
  const [oracleId, setOracleId] = useState<string | null>(null);   // advanced: a specific expiry
  const [expiries, setExpiries] = useState<DeepBookExpiry[]>([]);
  const [currency, setCurrency] = useState<Currency>("dUSDC");
  const [quote, setQuote] = useState<DeepBookQuote | null>(null);
  const [qErr, setQErr] = useState<string | null>(null);
  const [pricing, setPricing] = useState(false);

  // deploy state
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [openErr, setOpenErr] = useState<string | null>(null);

  const notionalNum = Number(notional);
  const valid = Number.isFinite(notionalNum) && notionalNum > 0;

  useEffect(() => {
    let alive = true;
    fetchDeepBookStrategies()
      .then((r) => { if (alive) { setStrategies(r.strategies); if (!selected && r.strategies[0]) setSelected(r.strategies[0].id); } })
      .catch((e) => { if (alive) setLoadErr(e instanceof Error ? e.message : String(e)); });
    fetchDeepBookExpiries()
      .then((r) => { if (alive) setExpiries(r.expiries); })
      .catch(() => { /* expiry strip stays empty → falls back to near/mid/far */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // price the selected strategy (debounced)
  const timer = useRef<number | null>(null);
  const lastNotional = useRef(notionalNum);
  useEffect(() => {
    if (!selected || !valid) { setQuote(null); return; }
    let alive = true;
    setPricing(true);
    const _immediate = lastNotional.current === notionalNum; // button click → instant; typing → debounced
    lastNotional.current = notionalNum;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      quoteDeepBookStrategy({ strategy_id: selected, notional_usd: notionalNum, expiry_pref: expiryPref, oracle_id: mode === "advanced" && oracleId ? oracleId : undefined, sender: wallet.address ?? undefined })
        .then((q) => { if (alive) { setQuote(q); setQErr(null); } })
        .catch((e) => {
          if (alive) {
            setQuote(null);
            setQErr(e instanceof Error ? e.message : String(e));
          }
        })
        .finally(() => { if (alive) setPricing(false); });
    }, _immediate ? 0 : 220);
    return () => { alive = false; if (timer.current) window.clearTimeout(timer.current); };
  }, [selected, notionalNum, valid, expiryPref, oracleId, mode, wallet.address]);


  // reset deploy result when the structure changes — including a rail switch, so a
  // stale "<name> deployed" ResultLine + explorer link can't linger while the note
  // copy flips to the other rail (contradictory panel).
  useEffect(() => { setResult(null); setOpenErr(null); }, [selected, notionalNum, expiryPref, oracleId, currency]);

  // Basic shows a curated 3 strategies; Advanced shows the full set. If the active
  // pick falls outside the basic list (e.g. after toggling Advanced→Basic), snap
  // back to the first visible strategy so the quote/payoff always has a selection.
  useEffect(() => {
    if (!strategies) return;
    const visible = mode === "advanced" ? strategies : basicTrio(strategies);
    if (selected && visible.some((s) => s.id === selected)) return;
    if (visible[0]) setSelected(visible[0].id);
  }, [mode, strategies, selected]);

  // Directional plays (Rally/Push/Fade/Flush) only separate from the forward on a
  // LONGER tenor, where the implied move (σ) is a meaningful % of price — on a 3h
  // tenor σ≈0.4% so "Fade Lower" sits ~0.5% off the forward (barely directional),
  // but on a multi-day tenor it targets ~-13%. Default directional strategies to
  // "far"; level/range plays stay on "mid". Switching strategy resets this sensible
  // default; the user can still override the expiry control.
  useEffect(() => {
    const s = strategies?.find((x) => x.id === selected);
    if (!s) return;
    setExpiryPref(s.direction === "up" || s.direction === "down" ? "far" : "mid");
  }, [selected, strategies]);

  const sel = strategies?.find((s) => s.id === selected) ?? null;
  const accent = sel ? DIR_COLOR[sel.direction] ?? C.tealLight : C.tealLight;
  const tradeableBuckets = quote ? quote.strip.buckets.filter((b) => b.tradeable && Number(b.quantity) > 0) : [];
  const visibleStrategies = !strategies ? [] : mode === "advanced" ? strategies : basicTrio(strategies);

  async function deploy() {
    if (!quote || busy) return;
    setBusy(true); setOpenErr(null); setResult(null);
    try {
      // mUSDC = Pelagos USDC settlement (same DeepBook pricing): deposit the premium into our own
      // Vault<MOCK_USDC> (real on-chain receipt), settle later by minting the payoff.
      if (currency === "mUSDC") {
        setStage("Opening position…");
        const bands = tradeableBuckets.map((b) => ({ lower_usd: b.lower_usd, higher_usd: b.higher_usd, payout_usd: ui(b.max_payout_raw) }));
        if (bands.length === 0) throw new Error("No tradeable legs in this strategy right now.");
        const prep = await simOpen({
          owner: wallet.address as string, product: "strip", name: quote.name,
          premium_usd: ui(quote.strip.total_cost_raw), max_payout_usd: ui(quote.strip.realized_max_payout_raw),
          oracle_id: quote.oracle_id, forward_usd: quote.forward_usd, expiry_ms: Number(quote.expiry), bands,
        });
        setStage("Sign in wallet…");
        const digest = await wallet.signAndExecute(prep.tx_bytes);
        setStage("Confirming…");
        await simConfirm(prep.sim_id, digest);
        setResult(digest);
        return;
      }
      setStage("Preparing manager…");
      const mgr = await ensureManager(wallet.address as string, wallet.signAndExecute);
      const buckets = tradeableBuckets.map((b) => ({ lower: b.lower, higher: b.higher, quantity: b.quantity }));
      if (buckets.length === 0) throw new Error("No tradeable legs in this strategy right now.");
      setStage("Building strip…");
      const deposit = ((BigInt(quote.strip.total_cost_raw) * 12n) / 10n).toString();
      const prep = await prepareOpenStrip({
        owner: wallet.address as string,
        manager_id: mgr,
        oracle_id: quote.oracle_id,
        expiry: quote.expiry,
        buckets,
        deposit_amount_raw: deposit,
      });
      setStage("Sign in wallet…");
      const digest = await wallet.signAndExecute(prep.tx_bytes);
      setStage("Confirming…");
      const c = await confirmPredict(digest);
      if (!c.ok) throw new Error(`On-chain open failed (${c.status}) — check the explorer before retrying.`);
      setResult(c.digest);
    } catch (e) { setOpenErr(friendlyWalletError(e)); }
    finally { setBusy(false); setStage(null); }
  }

  // ── loading / error / empty
  if (loadErr && !strategies) {
    return <div className="db-banner err">Couldn’t load DeepBook strategies — {loadErr}</div>;
  }
  if (!strategies) {
    return (
      <div className="db-strat-grid">
        {Array.from({ length: mode === "basic" ? 3 : 7 }).map((_, i) => <div key={i} className="db-card db-skel" style={{ height: 132 }} />)}
      </div>
    );
  }

  const deployBtn = (
    !wallet.connected ? (
      <ConnectModal defaultOpen={false} trigger={<button className="db-cta" style={{ background: C.tealLight }}>Connect a wallet</button>} />
    ) : (
      <button className="db-cta" style={{ background: C.tealLight }} disabled={busy || !quote || tradeableBuckets.length === 0} aria-busy={busy} onClick={deploy}>
        {busy ? (stage ?? "Submitting…") : `Deploy · ${quote ? usd(quote.strip.total_cost_raw) : "—"}`}
      </button>
    )
  );

  return (
    <div className="db-surface">
      {/* strategy cards */}
      <div className={`db-strat-grid${mode === "basic" ? " is-basic" : ""}`}>
        {visibleStrategies.map((s) => {
          const on = s.id === selected;
          const rc = RISK_COLOR[s.tail_risk] ?? C.textMuted;
          const dc = DIR_COLOR[s.direction] ?? C.tealLight;
          return (
            <button key={s.id} className={`db-card db-strat${on ? " is-active" : ""}`} style={on ? { borderColor: dc, background: `${dc}10` } : undefined} onClick={() => setSelected(s.id)}>
              <div className="db-strat-top">
                <DirectionIcon dir={s.direction} color={on ? dc : C.textMuted} />
                <div className="db-strat-tags">
                  <Tag label={s.tail_risk === "med" ? "MED RISK" : `${s.tail_risk.toUpperCase()} RISK`} color={rc} />
                </div>
              </div>
              <b style={on ? { color: dc } : undefined}>{s.name}</b>
              <em>{s.thesis}</em>
              <span className="db-strat-foot">{DIR_LABEL[s.direction] ?? s.direction}</span>
            </button>
          );
        })}
      </div>

      {/* controls — text left · expiry options middle · order box right */}
      <div className="db-card db-controls">
        <div className="db-controls-meta">
          <span className="db-cap">Horizon</span>
          <strong>{quote ? quote.tenor_label : pricing ? "…" : "—"}</strong>
          <span className="db-controls-thesis">{sel?.thesis ?? "Select a strategy."}</span>
        </div>
        <div className="db-expiry">
          <span className="db-cap">Expiry</span>
          {mode === "advanced" && expiries.length > 0 ? (
            <div className="db-strike-strip">
              {expiries.map((e) => {
                const on = oracleId ? e.oracle_id === oracleId : quote?.oracle_id === e.oracle_id;
                return (
                  <button key={e.oracle_id} type="button" className={`db-strike${on ? " is-on" : ""}`} onClick={() => setOracleId(e.oracle_id)}>
                    {e.tenor_label}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="db-seg">
              {(["near", "mid", "far"] as const).map((p) => (
                <button key={p} type="button" className={expiryPref === p ? "is-on" : ""} onClick={() => setExpiryPref(p)}>{p}</button>
              ))}
            </div>
          )}
        </div>
        <div className="db-amount">
          <span className="db-cap">Notional</span>
          <div className="db-amount-in">
            <span className="db-amount-cur">$</span>
            <input className="db-num" inputMode="decimal" value={notional} onChange={(e) => setNotional(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" />
            <CurrencySelect value={currency} onChange={setCurrency} />
          </div>
        </div>
      </div>

      {qErr && !quote && <div className="db-banner err">{qErr}</div>}

      {/* quote */}
      {mode === "basic"
        ? <StrategyBasic quote={quote} pricing={pricing} accent={accent} deployBtn={deployBtn} result={result} openErr={openErr} tradeable={tradeableBuckets.length} currency={currency} />
        : <StrategyAdvanced quote={quote} pricing={pricing} accent={accent} deployBtn={deployBtn} result={result} openErr={openErr} buckets={tradeableBuckets} />}
    </div>
  );
}

// ── BASIC: outcome-first. The price ladder (where you win) + one plain-English
//    promise + deploy. Deliberately hides ALL microstructure (bid/ask, slippage,
//    greeks) so it reads "pick a bet, see what you win" — the opposite of Advanced.
function StrategyBasic({ quote, pricing, accent, deployBtn, result, openErr, tradeable, currency }: {
  quote: DeepBookQuote | null; pricing: boolean; accent: string; deployBtn: React.ReactNode; result: string | null; openErr: string | null; tradeable: number; currency: Currency;
}) {
  if (!quote) {
    return <div className="db-card db-empty">{pricing ? "Pricing the strip on DeepBook…" : "Enter a notional to price this strategy."}</div>;
  }
  const cost = ui(quote.strip.total_cost_raw);
  const best = ui(quote.strip.realized_max_payout_raw);
  const mult = cost > 0 ? best / cost : 0;
  const outcomeIf = OUTCOME_IF[quote.direction] ?? "BTC lands in range";
  return (
    <div className="db-basic" style={{ opacity: pricing ? 0.55 : 1, transition: "opacity .12s ease" }}>
      <div className="db-quote-row">
        {/* hero: the price ladder (where you win, by band), then the outcome line */}
        <div className="db-card db-payoff db-hero">
          <div className="db-card-head"><span className="db-cap">Where you win · price ladder</span><span className="db-dim">{pricing ? "updating…" : `${tradeable} bands · live`}</span></div>
          <RangeLadder quote={quote} accent={accent} />
          <p className="db-outcome-line">
            Risk <b>{money2(cost)}</b> to win up to <b style={{ color: accent }}>{money2(best)}</b> — a <b>{mult.toFixed(2)}×</b> payout. Best if <b style={{ color: C.textPrimary }}>{outcomeIf}</b>.
          </p>
          <p className="db-risk">{quote.risk_note}</p>
        </div>

        {/* clean "what you get" + deploy — no greeks, no bands */}
        <div className="db-card db-deploy-card">
          <div className="db-card-head"><span className="db-cap">Deploy</span><span className="db-dim">{quote.tenor_label}</span></div>
          <div className="db-dsum">
            <div><span className="db-dsum-k">Cost</span><span className="db-dsum-v">{usd(quote.strip.total_cost_raw)}</span></div>
            <div><span className="db-dsum-k">Max payout</span><span className="db-dsum-v" style={{ color: accent }}>{usd(quote.strip.realized_max_payout_raw)}</span></div>
            <div><span className="db-dsum-k">Max loss</span><span className="db-dsum-v">{money2(quote.max_loss_usd)}</span></div>
            <div><span className="db-dsum-k">Settles</span><span className="db-dsum-v">{currency === "mUSDC" ? "Sui · mUSDC vault" : "Sui · DeepBook Predict"}</span></div>
          </div>
          <div className="db-deploy-act">
            {deployBtn}
            {result && <div role="status" aria-live="polite"><ResultLine digest={result} label={`${quote.name} deployed`} /></div>}
            {openErr && <div className="db-banner err" role="alert" style={{ marginTop: 10 }}>{openErr}</div>}
            <p className="db-note">{currency === "mUSDC"
              ? "Uses the same live DeepBook price and payout schedule, with mUSDC deposited to the Pelagos Sui vault and the payoff minted at settlement."
              : "Minted on-chain via DeepBook Predict, priced live from the order book. Settles on Sui testnet."}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ADVANCED: the DeepBook order-book desk. A live bid/ask price ladder with a
//    mark-to-market "exit now" column (the only product with a secondary-market
//    story) leads; greeks + a compact payoff + deploy follow. Microstructure-first
//    — the opposite of Basic's outcome-first view.
function StrategyAdvanced({ quote, pricing, accent, deployBtn, result, openErr, buckets }: {
  quote: DeepBookQuote | null; pricing: boolean; accent: string; deployBtn: React.ReactNode; result: string | null; openErr: string | null; buckets: DeepBookBucket[];
}) {
  if (!quote) {
    return <div className="db-card db-empty">{pricing ? "Pricing the strip on DeepBook…" : "Enter a notional to price this strategy."}</div>;
  }
  const g = quote.greeks;
  // theta now smooth-squashes toward its position-value cap; near the cap the
  // per-day number is no longer meaningful, so show "—" with a short-tenor note.
  const thetaSaturated = Math.abs(g.theta_usd_day) >= 0.9 * Math.abs(g.position_value_usd);
  const maxQty = Math.max(1, ...buckets.map((b) => Number(b.quantity) / 1e6));
  const cost = ui(quote.strip.total_cost_raw);
  const exitNow = ui(quote.strip.total_redeem_value_raw);
  const spread = ui(quote.strip.round_trip_spread_raw);
  return (
    <div className="db-adv" style={{ opacity: pricing ? 0.55 : 1, transition: "opacity .12s ease" }}>
      {/* HERO row: the payout ladder — where you win, by band (left) · greeks + deploy (right) */}
      <div className="db-adv-top">
        <div className="db-card db-payoff db-hero">
          <div className="db-card-head"><span className="db-cap">Where you win · payout by band</span><span className="db-dim">{DIR_LABEL[quote.direction] ?? quote.direction}</span></div>
          <RangeLadder quote={quote} accent={accent} />
        </div>
        <div className="db-side">
          <div className="db-card">
            <div className="db-card-head"><span className="db-cap">Greeks</span><span className="db-dim">position</span></div>
            <div className="db-greeks">
              <Greek sym="Δ" name="Delta" val={`${g.delta_btc >= 0 ? "+" : ""}${g.delta_btc.toFixed(4)}`} unit="BTC" />
              <Greek sym="Γ" name="Gamma" val={g.gamma.toFixed(5)} color={g.gamma >= 0 ? C.green : C.red} />
              <Greek sym="ν" name="Vega" val={`${g.vega_usd >= 0 ? "+" : ""}${money2(g.vega_usd)}`} unit="/pt" color={g.vega_usd >= 0 ? C.green : C.red} />
              <Greek sym="Θ" name="Theta" val={thetaSaturated ? "—" : `${g.theta_usd_day >= 0 ? "+" : ""}${money2(g.theta_usd_day)}`} unit={thetaSaturated ? "short tenor" : "/day"} color={thetaSaturated ? undefined : (g.theta_usd_day >= 0 ? C.green : C.red)} />
            </div>
            <div className="db-greek-foot">
              <RouteHandle k="Position value" v={money2(g.position_value_usd)} />
              <RouteHandle k="Max loss" v={money2(quote.max_loss_usd)} />
            </div>
          </div>
          <div className="db-card db-deploy-card">
            {deployBtn}
            {result && <div role="status" aria-live="polite"><ResultLine digest={result} label={`${quote.name} deployed`} /></div>}
            {openErr && <div className="db-banner err" role="alert" style={{ marginTop: 10 }}>{openErr}</div>}
          </div>
        </div>
      </div>

      {/* the DeepBook price ladder — ask (cost) vs bid (exit-now) per band, round-trip */}
      <div className="db-card db-book">
        <div className="db-card-head">
          <span className="db-cap">DeepBook price ladder · range bands</span>
          <span className="db-dim">{buckets.length} / {quote.strip.buckets.length} tradeable · live</span>
        </div>
        <div className="db-ladder">
          <div className="db-lrow db-lrow-h">
            <span>Range band</span><span className="db-lh-depth">Depth</span><span>Qty</span><span>Ask · cost</span><span>Bid · exit now</span><span>Slippage</span>
          </div>
          {(quote.strip?.buckets ?? []).map((b) => {
            const t = b.tradeable && Number(b.quantity) > 0;
            const q = Number(b.quantity) / 1e6;
            return (
              <div className={`db-lrow${t ? "" : " is-dim"}`} key={`${b.lower}-${b.higher}`}>
                <span className="db-band">{money(b.lower_usd)}–{money(b.higher_usd)}</span>
                <span className="db-ldepth"><i style={{ width: `${t ? Math.max(6, (q / maxQty) * 100) : 0}%`, background: accent }} /></span>
                <span>{t ? q.toFixed(0) : "—"}</span>
                <span>{t ? usd(b.mint_cost_raw) : "—"}</span>
                <span style={t ? { color: C.green } : undefined}>{t ? usd(b.redeem_value_raw) : "—"}</span>
                <span className="db-slip">{t ? usd(b.slippage_raw, 4) : "—"}</span>
              </div>
            );
          })}
          <div className="db-lrow db-lrow-tot">
            <span>Total</span>
            <span className="db-ldepth" />
            <span>—</span>
            <span>{usd(quote.strip.total_cost_raw)}</span>
            <span style={{ color: C.green }}>{usd(quote.strip.total_redeem_value_raw)}</span>
            <span className="db-slip">{usd(quote.strip.total_slippage_raw, 4)}</span>
          </div>
        </div>
        {/* mark-to-market: cost to enter vs value exiting immediately (round-trip) */}
        <div className="db-mtm">
          <div><span className="db-cap">Cost to deploy</span><strong>{money2(cost)}</strong></div>
          <div><span className="db-cap">Exit now · bid</span><strong style={{ color: C.green }}>{money2(exitNow)}</strong></div>
          <div><span className="db-cap">Round-trip spread</span><strong style={{ color: C.amber }}>{money2(spread)}</strong></div>
          <div><span className="db-cap">Max payout</span><strong style={{ color: accent }}>{usd(quote.strip.realized_max_payout_raw)}</strong></div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  EARN YIELD · DEEPBOOK PLP COUNTERPARTY
// ═══════════════════════════════════════════════════════════════
function YieldSurface({ wallet, mode }: { wallet: ReturnType<typeof useWalletSigner>; mode: "basic" | "advanced" }) {
  const [strategies, setStrategies] = useState<YieldStrategy[] | null>(null);
  const [selected, setSelected] = useState("core-market-maker");
  const [capital, setCapital] = useState("10");
  const [currency, setCurrency] = useState<Currency>("dUSDC");
  const [quote, setQuote] = useState<YieldQuote | null>(null);
  const [account, setAccount] = useState<YieldAccount | null>(null);
  const [pricing, setPricing] = useState(false);
  const [qErr, setQErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionLocation, setActionLocation] = useState<"deploy" | "account">("deploy");
  const [stage, setStage] = useState<string | null>(null);
  const [result, setResult] = useState<{ digest: string; label: string; location: "deploy" | "account" } | null>(null);
  const [openErr, setOpenErr] = useState<string | null>(null);
  const dusdc = useDusdcBalance();
  const musdc = useUsdcBalance();
  const amount = Number(capital);
  const valid = Number.isFinite(amount) && amount >= 5 && amount <= 250;
  const balance = currency === "dUSDC" ? dusdc.uiAmount : musdc.uiAmount;
  const managerIdle = account?.managers[0]?.idle_usd ?? 0;
  const requiredWalletAmount = currency === "dUSDC" && quote?.hedge
    ? quote.allocation.plp_usd + Math.max(0, quote.allocation.hedge_funding_usd - managerIdle)
    : amount;
  const shortBalance = wallet.connected && valid && balance + 1e-9 < requiredWalletAmount;

  useEffect(() => {
    let alive = true;
    fetchYieldStrategies()
      .then((value) => { if (alive) setStrategies(value.strategies); })
      .catch((error) => { if (alive) setQErr(error instanceof Error ? error.message : String(error)); });
    return () => { alive = false; };
  }, []);

  const refreshAccount = React.useCallback(() => {
    if (!wallet.address) { setAccount(null); return; }
    fetchYieldAccount(wallet.address).then(setAccount).catch(() => setAccount(null));
  }, [wallet.address]);
  useEffect(() => { refreshAccount(); }, [refreshAccount, result]);

  useEffect(() => {
    if (!valid || !selected) { setQuote(null); return; }
    let alive = true;
    const id = window.setTimeout(() => {
      setPricing(true);
      quoteYieldStrategy({ strategy_id: selected, capital_usd: amount, sender: wallet.address ?? undefined })
        .then((value) => { if (alive) { setQuote(value); setQErr(null); } })
        .catch((error) => { if (alive) { setQuote(null); setQErr(error instanceof Error ? error.message : String(error)); } })
        .finally(() => { if (alive) setPricing(false); });
    }, 180);
    return () => { alive = false; window.clearTimeout(id); };
  }, [selected, amount, valid, wallet.address]);

  useEffect(() => { setResult(null); setOpenErr(null); }, [selected, amount, currency]);

  async function deployYield() {
    if (!quote || busy || shortBalance || !wallet.address) return;
    setActionLocation("deploy");
    setBusy(true); setOpenErr(null); setResult(null);
    try {
      let manager: string | undefined;
      if (currency === "dUSDC" && quote.hedge) {
        setStage("Preparing manager…");
        manager = await ensureManager(wallet.address, wallet.signAndExecute);
      }
      setStage("Building allocation…");
      const prep = await prepareYieldOpen({ quote_id: quote.quote_id, owner: wallet.address, currency, manager_id: manager });
      setStage("Sign in wallet…");
      const digest = await wallet.signAndExecute(prep.tx_bytes);
      setStage("Confirming…");
      if (currency === "mUSDC") {
        if (!prep.sim_id) throw new Error("Yield receipt was not created.");
        await simConfirm(prep.sim_id, digest);
      } else {
        const confirmed = await confirmPredict(digest);
        if (!confirmed.ok) throw new Error(`On-chain allocation failed (${confirmed.status}).`);
      }
      setResult({ digest, label: `${quote.strategy.name} opened`, location: "deploy" });
    } catch (error) { setOpenErr(friendlyWalletError(error)); }
    finally { setBusy(false); setStage(null); }
  }

  async function withdrawPlp() {
    if (!wallet.address || !account || account.shares <= 0 || busy) return;
    setActionLocation("account");
    setBusy(true); setOpenErr(null); setResult(null);
    try {
      setStage("Building PLP withdrawal…");
      const prep = await prepareLpWithdraw({ owner: wallet.address });
      setStage("Sign in wallet…");
      const digest = await wallet.signAndExecute(prep.tx_bytes);
      setStage("Confirming…");
      const confirmed = await confirmPredict(digest);
      if (!confirmed.ok) throw new Error(`PLP withdrawal failed (${confirmed.status}).`);
      setResult({ digest, label: "PLP withdrawal confirmed", location: "account" });
    } catch (error) { setOpenErr(friendlyWalletError(error)); }
    finally { setBusy(false); setStage(null); }
  }

  async function exitRanges() {
    if (!wallet.address || !account || busy) return;
    const manager = account.managers.find((item) => item.ranges.length > 0);
    if (!manager) return;
    setActionLocation("account");
    setBusy(true); setOpenErr(null); setResult(null);
    try {
      setStage("Building range exit…");
      const prep = await prepareYieldRangeExit({ owner: wallet.address, manager_id: manager.manager_id });
      setStage("Sign in wallet…");
      const digest = await wallet.signAndExecute(prep.tx_bytes);
      setStage("Confirming…");
      const confirmed = await confirmPredict(digest);
      if (!confirmed.ok) throw new Error(`Range exit failed (${confirmed.status}).`);
      setResult({ digest, label: `${prep.bucket_count ?? manager.ranges.length} ranges exited${prep.remaining_count ? ` · ${prep.remaining_count} remain` : ""}`, location: "account" });
    } catch (error) { setOpenErr(friendlyWalletError(error)); }
    finally { setBusy(false); setStage(null); }
  }

  async function reclaimIdle() {
    if (!wallet.address || !account || busy) return;
    const manager = account.managers.find((item) => item.idle_usd > 0);
    if (!manager) return;
    setActionLocation("account");
    setBusy(true); setOpenErr(null); setResult(null);
    try {
      setStage("Building idle reclaim…");
      const prep = await prepareManagerWithdraw({ owner: wallet.address, manager_id: manager.manager_id });
      setStage("Sign in wallet…");
      const digest = await wallet.signAndExecute(prep.tx_bytes);
      setStage("Confirming…");
      const confirmed = await confirmPredict(digest);
      if (!confirmed.ok) throw new Error(`Idle reclaim failed (${confirmed.status}).`);
      setResult({ digest, label: `${money2(manager.idle_usd)} idle dUSDC reclaimed`, location: "account" });
    } catch (error) { setOpenErr(friendlyWalletError(error)); }
    finally { setBusy(false); setStage(null); }
  }

  if (!strategies) return <div className="db-strat-grid">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="db-card db-skel" style={{ height: 132 }} />)}</div>;
  const visible = mode === "advanced" ? strategies : strategies.slice(0, 3);
  const selectedDef = strategies.find((item) => item.id === selected) ?? visible[0];
  const lifetime = quote ? quote.vault.lifetime_share_return * 100 : 0;
  const musdcScenarios: YieldQuote["scenarios"] = quote ? [
    { id: "current-book-bound", label: "Schedule minimum", value_usd: quote.musdc_model.minimum_terminal_usd, return_pct: ((quote.musdc_model.minimum_terminal_usd - quote.capital_usd) / quote.capital_usd) * 100, kind: "risk" },
    { id: "mark", label: "Model midpoint", value_usd: quote.musdc_model.expected_terminal_usd, return_pct: ((quote.musdc_model.expected_terminal_usd - quote.capital_usd) / quote.capital_usd) * 100, kind: "base" },
    { id: "hedge-best", label: "Schedule maximum", value_usd: quote.musdc_model.maximum_terminal_usd, return_pct: ((quote.musdc_model.maximum_terminal_usd - quote.capital_usd) / quote.capital_usd) * 100, kind: "upside" },
  ] : [];

  const deployButton = !wallet.connected
    ? <ConnectModal defaultOpen={false} trigger={<button className="db-cta" style={{ background: C.green }}>Connect a wallet</button>} />
    : <button className="db-cta" style={{ background: C.green }} disabled={!quote || busy || shortBalance} onClick={deployYield}>{busy && actionLocation === "deploy" ? stage : shortBalance ? `Need more ${currency}` : `Provide ${money2(amount)} liquidity`}</button>;

  return (
    <div className="db-surface">
      <div className={`db-strat-grid db-yield-grid${mode === "basic" ? " is-basic" : ""}`}>
        {visible.map((strategy) => {
          const on = strategy.id === selected;
          const color = strategy.hedge === "none" ? C.amber : strategy.hedge === "downside" ? C.red : C.green;
          return <button key={strategy.id} className={`db-card db-strat${on ? " is-active" : ""}`} style={on ? { borderColor: color, background: `${color}0d` } : undefined} onClick={() => setSelected(strategy.id)}>
            <div className="db-strat-top"><b style={on ? { color } : undefined}>{strategy.name}</b><Tag label={`${strategy.risk.toUpperCase()} RISK`} color={RISK_COLOR[strategy.risk] ?? C.amber} /></div>
            <em>{strategy.thesis}</em>
            <span className="db-strat-foot">{Math.round(strategy.plp_target_pct * 100)}% PLP target · {strategy.hedge === "none" ? "unhedged" : `${strategy.hedge} hedge`}</span>
          </button>;
        })}
      </div>

      <div className="db-card db-controls">
        <div className="db-controls-meta">
          <span className="db-cap">PLP share price</span>
          <strong>{quote ? quote.vault.share_price.toFixed(6) : pricing ? "…" : "—"}</strong>
          <span className="db-controls-thesis">{quote ? `${pctSigned(lifetime)} since pool launch · no annualized APY` : selectedDef?.carry_source}</span>
        </div>
        <div className="db-yield-health">
          <span className="db-cap">Live pool</span>
          <div className="db-health-line">
            <span><i style={{ width: `${Math.min(100, (quote?.vault.utilization ?? 0) * 100)}%` }} /></span>
            <b>{quote ? `${(quote.vault.utilization * 100).toFixed(1)}% utilized` : "—"}</b>
            <em>{quote ? `${money2(quote.vault.available_liquidity_usd)} liquid` : ""}</em>
          </div>
        </div>
        <div className="db-amount">
          <span className="db-cap">Capital · $5–$250</span>
          <div className="db-amount-in"><span className="db-amount-cur">$</span><input className="db-num" inputMode="decimal" value={capital} onChange={(e) => setCapital(e.target.value.replace(/[^0-9.]/g, ""))} /><CurrencySelect value={currency} onChange={setCurrency} /></div>
        </div>
      </div>

      {qErr && <div className="db-banner err">{qErr}</div>}
      {!quote ? <div className="db-card db-empty">{pricing ? "Pricing PLP and hedge legs…" : "Enter $5–$250 to build the allocation."}</div> : (
        <div className={mode === "advanced" ? "db-yield-advanced" : "db-yield-basic"} style={{ opacity: pricing ? 0.58 : 1 }}>
          <div className="db-card db-stack-card">
            <div className="db-card-head"><span className="db-cap">{currency === "dUSDC" ? "Funded capital stack" : "Reference capital model"}</span><span className="db-dim">sums to {money2(quote.capital_usd)}</span></div>
            <CapitalStack quote={quote} />
            <div className="db-stack-rows">
              <DeployStat label={currency === "dUSDC" ? "DeepBook PLP" : "Reference PLP"} value={money2(quote.allocation.plp_usd)} color={C.green} />
              <DeployStat label={currency === "dUSDC" ? "Hedge premium" : "Reference hedge"} value={money2(quote.allocation.hedge_cost_usd)} color={C.tealLight} />
              <DeployStat label={currency === "dUSDC" ? "Manager buffer" : "Model reserve"} value={money2(quote.allocation.manager_buffer_usd)} color={C.amber} />
              <DeployStat label={currency === "dUSDC" ? "Expected PLP shares" : "Execution rail"} value={currency === "dUSDC" ? quote.plp_stress.expected_shares.toFixed(4) : "Isolated receipt"} />
            </div>
            <p className="db-note">{currency === "dUSDC" ? quote.strategy.risk_note : `${quote.musdc_model.description} It does not confer PLP ownership or dUSDC rights.`}</p>
          </div>

          <div className="db-card db-scenario-card">
            <div className="db-card-head"><span className="db-cap">{currency === "dUSDC" ? "Risk scenarios" : "Receipt outcomes"}</span><span className="db-dim">{currency === "dUSDC" ? "current book · not a forecast" : "canonical terminal schedule"}</span></div>
            <ScenarioRows scenarios={currency === "dUSDC" ? quote.scenarios : musdcScenarios} capital={quote.capital_usd} />
          </div>

          {mode === "advanced" && <>
            <div className="db-card db-model-card">
              <div className="db-card-head"><span className="db-cap">mUSDC isolated payoff</span><span className="db-dim">live DeepBook reference book</span></div>
              <TerminalPayoffLadder bands={quote.musdc_model.terminal_bands} capital={quote.capital_usd} accent={C.tealLight} />
              <div className="db-mtm">
                <div><span className="db-cap">Reference premium</span><strong>{money2(quote.reference_book.premium_usd)}</strong></div>
                <div><span className="db-cap">Model midpoint</span><strong>{money2(quote.musdc_model.expected_terminal_usd)}</strong></div>
                <div><span className="db-cap">Model minimum</span><strong style={{ color: C.red }}>{money2(quote.musdc_model.minimum_terminal_usd)}</strong></div>
                <div><span className="db-cap">Model maximum</span><strong style={{ color: C.green }}>{money2(quote.musdc_model.maximum_terminal_usd)}</strong></div>
              </div>
            </div>
            <div className="db-card">
              <div className="db-card-head"><span className="db-cap">{currency === "dUSDC" ? "Vault accounting" : "Reference vault accounting"}</span><span className="db-dim">NAV = balance − marked liability</span></div>
              <div className="db-metrics">
                <Metric label="Vault balance" value={money2(quote.vault.balance_usd)} />
                <Metric label="Marked liability" value={money2(quote.vault.marked_liability_usd)} color={C.amber} />
                <Metric label="PLP NAV" value={money2(quote.vault.nav_usd)} color={C.green} />
                <Metric label="Risk capacity" value={money2(quote.vault.remaining_risk_capacity_usd)} />
              </div>
            </div>
          </>}

          <div className="db-card db-deploy-card">
            <div className="db-card-head"><span className="db-cap">Provide liquidity</span><span className="db-dim">{currency === "dUSDC" ? "DeepBook PLP · pooled" : "isolated reference payoff"}</span></div>
            {deployButton}
            {shortBalance && <div className="db-banner err">Needs {money2(requiredWalletAmount)} {currency} from this wallet; balance is {money2(balance)}.</div>}
            {result?.location === "deploy" && <ResultLine digest={result.digest} label={result.label} />}
            {openErr && actionLocation === "deploy" && <div className="db-banner err">{openErr}</div>}
            <p className="db-note">{currency === "dUSDC" ? "You receive transferable PLP shares. NAV can fall and withdrawal depends on unreserved pool liquidity." : quote.musdc_model.description}</p>
          </div>

          <div className="db-card db-position-card">
            <div className="db-card-head"><span className="db-cap">Your dUSDC account</span><span className="db-dim">PLP NAV + live range bids + idle</span></div>
            <div className="db-position-line"><div><strong>{account ? money2(account.total_value_usd) : wallet.connected ? "Loading…" : "—"}</strong><span>{account ? `${account.shares.toFixed(4)} PLP · ${account.range_position_count} range${account.range_position_count === 1 ? "" : "s"} · ${money2(account.manager_idle_usd)} idle` : "Connect to read on-chain positions"}</span></div><div className="db-position-actions"><button type="button" className="db-secondary" disabled={!account || account.range_position_count <= 0 || busy} onClick={exitRanges}>Exit ranges</button><button type="button" className="db-secondary" disabled={!account || account.manager_idle_usd <= 0 || busy} onClick={reclaimIdle}>Reclaim idle</button><button type="button" className="db-secondary" disabled={!account || account.shares <= 0 || busy} onClick={withdrawPlp}>Withdraw PLP</button></div></div>
            {account && account.range_position_count > 0 && <p className="db-note">Range exits settle at DeepBook bids into manager idle dUSDC; reclaiming idle returns it to the wallet.</p>}
            {busy && actionLocation === "account" && <div className="db-banner">{stage}</div>}
            {result?.location === "account" && <ResultLine digest={result.digest} label={result.label} />}
            {openErr && actionLocation === "account" && <div className="db-banner err">{openErr}</div>}
            {account?.range_mark_status === "unavailable" && <div className="db-banner db-warn">One or more range bid marks are temporarily unavailable and excluded from this account value.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function CapitalStack({ quote }: { quote: YieldQuote }) {
  const total = quote.capital_usd || 1;
  return <div className="db-capital-stack" aria-label="Capital allocation">
    <span style={{ width: `${(quote.allocation.plp_usd / total) * 100}%`, background: C.green }} title="PLP" />
    {quote.allocation.hedge_cost_usd > 0 && <span style={{ width: `${(quote.allocation.hedge_cost_usd / total) * 100}%`, background: C.tealLight }} title="Hedge" />}
    {quote.allocation.manager_buffer_usd > 0 && <span style={{ width: `${(quote.allocation.manager_buffer_usd / total) * 100}%`, background: C.amber }} title="Buffer" />}
  </div>;
}

function ScenarioRows({ scenarios, capital }: { scenarios: YieldQuote["scenarios"]; capital: number }) {
  const max = Math.max(capital, ...scenarios.map((scenario) => scenario.value_usd), 1);
  return <div className="db-scenario-list">{scenarios.map((scenario) => {
    const color = scenario.kind === "risk" ? C.red : scenario.kind === "upside" ? C.green : C.tealLight;
    return <div className="db-scenario" key={scenario.id}><span>{scenario.label}</span><i><b style={{ width: `${Math.max(2, (scenario.value_usd / max) * 100)}%`, background: color }} /></i><strong style={{ color }}>{money2(scenario.value_usd)}<em>{pctSigned(scenario.return_pct)}</em></strong></div>;
  })}</div>;
}

// ═══════════════════════════════════════════════════════════════
//  FUNDED NOTES · TERMINAL BARRIERS + DISCRETE AUTOCALL
// ═══════════════════════════════════════════════════════════════
function NotesSurface({ wallet, mode }: { wallet: ReturnType<typeof useWalletSigner>; mode: "basic" | "advanced" }) {
  const [presets, setPresets] = useState<NotePreset[] | null>(null);
  const [selected, setSelected] = useState("capital-guard");
  const [principal, setPrincipal] = useState("10");
  const [currency, setCurrency] = useState<Currency>("dUSDC");
  const [tenor, setTenor] = useState(40);
  const [quote, setQuote] = useState<NoteQuote | null>(null);
  const [account, setAccount] = useState<YieldAccount | null>(null);
  const [pricing, setPricing] = useState(false);
  const [qErr, setQErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [openErr, setOpenErr] = useState<string | null>(null);
  const dusdc = useDusdcBalance();
  const musdc = useUsdcBalance();
  const amount = Number(principal);
  const valid = Number.isFinite(amount) && amount >= 5 && amount <= 250;
  const balance = currency === "dUSDC" ? dusdc.uiAmount : musdc.uiAmount;

  useEffect(() => {
    let alive = true;
    fetchNotePresets().then((value) => { if (alive) setPresets(value.presets); }).catch((error) => { if (alive) setQErr(error instanceof Error ? error.message : String(error)); });
    return () => { alive = false; };
  }, []);
  const selectedPreset = presets?.find((item) => item.id === selected) ?? null;
  const supported = selectedPreset?.supported_currencies.includes(currency) ?? true;
  const managerIdle = account?.managers[0]?.idle_usd ?? 0;
  const requiredWalletAmount = currency === "dUSDC" && quote?.allocation
    ? quote.allocation.plp_reserve_usd + Math.max(0, quote.allocation.strip_funding_usd - managerIdle)
    : amount;
  const shortBalance = wallet.connected && valid && balance + 1e-9 < requiredWalletAmount;

  useEffect(() => {
    if (!wallet.address) { setAccount(null); return; }
    let alive = true;
    fetchYieldAccount(wallet.address)
      .then((value) => { if (alive) setAccount(value); })
      .catch(() => { if (alive) setAccount(null); });
    return () => { alive = false; };
  }, [wallet.address, result]);

  useEffect(() => {
    if (!valid || !selected) { setQuote(null); return; }
    let alive = true;
    const id = window.setTimeout(() => {
      setPricing(true);
      quoteNote({ principal_usd: amount, preset_id: selected, tenor_days: tenor, sender: wallet.address ?? undefined })
        .then((value) => { if (alive) { setQuote(value); setQErr(null); } })
        .catch((error) => { if (alive) { setQuote(null); setQErr(error instanceof Error ? error.message : String(error)); } })
        .finally(() => { if (alive) setPricing(false); });
    }, 180);
    return () => { alive = false; window.clearTimeout(id); };
  }, [amount, selected, tenor, valid, wallet.address]);
  useEffect(() => { setResult(null); setOpenErr(null); }, [selected, amount, currency, tenor]);

  async function deployNote() {
    if (!quote || !wallet.address || busy || shortBalance || !supported) return;
    setBusy(true); setOpenErr(null); setResult(null);
    try {
      let manager: string | undefined;
      if (currency === "dUSDC") {
        setStage("Preparing manager…");
        manager = await ensureManager(wallet.address, wallet.signAndExecute);
      }
      setStage("Building funded note…");
      const prep = await prepareNoteOpen({ quote_id: quote.quote_id, owner: wallet.address, currency, manager_id: manager });
      setStage("Sign in wallet…");
      const digest = await wallet.signAndExecute(prep.tx_bytes);
      setStage("Confirming…");
      if (currency === "mUSDC") {
        if (!prep.sim_id) throw new Error("Note receipt was not created.");
        await simConfirm(prep.sim_id, digest);
      } else {
        const confirmed = await confirmPredict(digest);
        if (!confirmed.ok) throw new Error(`On-chain note failed (${confirmed.status}).`);
      }
      setResult(digest);
    } catch (error) { setOpenErr(friendlyWalletError(error)); }
    finally { setBusy(false); setStage(null); }
  }

  if (!presets) return <div className="db-note-grid">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="db-card db-skel" style={{ height: 142 }} />)}</div>;
  const visible = mode === "advanced" ? presets : presets.slice(0, 3);
  return <div className="db-surface">
    <div className={`db-note-grid${mode === "basic" ? " is-basic" : ""}`}>{visible.map((preset) => {
      const on = preset.id === selected;
      const color = preset.kind === "autocall" ? C.violet : preset.kind.includes("knock") ? C.amber : C.tealLight;
      return <button key={preset.id} className={`db-card db-strat${on ? " is-active" : ""}`} style={on ? { borderColor: color, background: `${color}0d` } : undefined} onClick={() => { setSelected(preset.id); setTenor(preset.default_tenor_days); if (preset.kind === "autocall") setCurrency("mUSDC"); }}>
        <div className="db-strat-top"><b style={on ? { color } : undefined}>{preset.name}</b><Tag label={preset.kind === "autocall" ? "AUTOCALL" : `${preset.risk.toUpperCase()} RISK`} color={RISK_COLOR[preset.risk] ?? C.amber} /></div>
        <em>{preset.summary}</em>
        <span className="db-strat-foot">{preset.kind === "autocall" ? "3 observations · 70% final KI" : `${Math.round(preset.reserve_target_pct * 100)}% reserve target · terminal`}</span>
      </button>;
    })}</div>

    <div className="db-card db-controls">
      <div className="db-controls-meta"><span className="db-cap">Payoff condition</span><strong>{quote?.preset.name ?? selectedPreset?.name ?? "—"}</strong><span className="db-controls-thesis">{selectedPreset?.payoff_condition}</span></div>
      <div className="db-expiry">
        <span className="db-cap">{selectedPreset?.kind === "autocall" ? "Observation schedule" : `Target tenor · ${quote?.oracle?.tenor_label ?? "live oracle selected"}`}</span>
        {selectedPreset?.kind === "autocall" ? <div className="db-schedule-readout">
          <strong>{quote?.autocall_terms?.observations.length ?? 3} live observations</strong>
          <span>{quote?.autocall_terms ? `${new Date(quote.autocall_terms.observations[0].observation_ms).toLocaleDateString(undefined, { month: "short", day: "numeric" })} → ${new Date(quote.autocall_terms.observations.at(-1)!.observation_ms).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "Selected from active BTC expiries"}</span>
        </div> : <div className="db-seg">{[5, 12, 40].map((days) => <button key={days} type="button" className={tenor === days ? "is-on" : ""} onClick={() => setTenor(days)}>{days}d</button>)}</div>}
      </div>
      <div className="db-amount"><span className="db-cap">Principal · $5–$250</span><div className="db-amount-in"><span className="db-amount-cur">$</span><input className="db-num" inputMode="decimal" value={principal} onChange={(e) => setPrincipal(e.target.value.replace(/[^0-9.]/g, ""))} /><CurrencySelect value={currency} onChange={setCurrency} options={selectedPreset?.supported_currencies} /></div></div>
    </div>

    {qErr && <div className="db-banner err">{qErr}</div>}
    {!supported && <div className="db-banner db-warn">Autocall 3 is mUSDC-only because its first-hit early redemption is enforced by the Pelagos observation lifecycle; DeepBook terminal ranges do not enforce an early call.</div>}
    {!quote ? <div className="db-card db-empty">{pricing ? "Pricing funded reserve and live strip…" : "Enter $5–$250 to price this note."}</div> : <div className={mode === "advanced" ? "db-note-advanced" : "db-note-basic"} style={{ opacity: pricing ? 0.58 : 1 }}>
      <div className="db-card db-outcome-card">
        <div className="db-card-head"><span className="db-cap">Outcome model</span><span className="db-dim">{quote.autocall_terms ? "canonical observations" : currency === "dUSDC" ? "PLP mark + live strip" : "isolated mUSDC schedule"}</span></div>
        <NoteOutcomeRows quote={quote} currency={currency} />
        <p className="db-note">{currency === "mUSDC" ? quote.musdc_risk_disclosure : quote.risk_disclosure}</p>
      </div>

      {quote.autocall_terms ? <div className="db-card db-observation-card">
        <div className="db-card-head"><span className="db-cap">Autocall observations</span><span className="db-dim">first hit terminates</span></div>
        <div className="db-observations">{quote.autocall_terms.observations.map((obs, index) => <div key={obs.oracle_id}><span>{new Date(obs.observation_ms).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span><strong>BTC ≥ {money(obs.call_barrier_usd)}</strong><em>redeem {money2(quote.principal_usd + obs.coupon_usd)}</em><b>{index + 1}</b></div>)}</div>
        <div className="db-ki-line"><span>Coupon budget</span><strong>{money2(quote.autocall_terms.coupon_budget_usd ?? quote.autocall_terms.observations.at(-1)?.coupon_usd ?? 0)}</strong><em>{quote.autocall_terms.coupon_source ?? "DeepBook premium reference"}</em></div>
        <div className="db-ki-line"><span>Final knock-in</span><strong>{money(quote.autocall_terms.knock_in_barrier_usd)}</strong><em>below this, redemption follows BTC one-for-one</em></div>
      </div> : <div className="db-card db-note-payoff-card">
        <div className="db-card-head"><span className="db-cap">Terminal payout schedule</span><span className="db-dim">{currency === "dUSDC" ? "PLP held at issue NAV" : "canonical mUSDC receipt"}</span></div>
        <TerminalPayoffLadder bands={quote.terminal_bands} capital={quote.principal_usd} accent={C.tealLight} />
        {currency === "dUSDC" && <p className="db-note">This ladder holds the PLP sleeve at its issue NAV. Realized dUSDC value uses the live PLP redemption value, which can be lower or liquidity-constrained.</p>}
      </div>}

      {mode === "advanced" && quote.allocation && <div className="db-card db-allocation-card">
        <div className="db-card-head"><span className="db-cap">{currency === "dUSDC" ? "Execution reconciliation" : "Reference model reconciliation"}</span><span className="db-dim">{currency === "dUSDC" ? "one funded PTB" : "isolated mUSDC receipt"}</span></div>
        <div className="db-reconcile"><div><span>{currency === "dUSDC" ? "PLP reserve" : "Reference reserve"}</span><strong>{money2(quote.allocation.plp_reserve_usd)}</strong></div><i>+</i><div><span>{currency === "dUSDC" ? "Strip premium" : "Strip reference"}</span><strong>{money2(quote.allocation.strip_cost_usd)}</strong></div><i>+</i><div><span>{currency === "dUSDC" ? "Manager buffer" : "Model residual"}</span><strong>{money2(quote.allocation.manager_buffer_usd)}</strong></div><i>=</i><div><span>Principal</span><strong>{money2(quote.principal_usd)}</strong></div></div>
        {currency === "dUSDC" ? <div className="db-metrics" style={{ marginTop: 12 }}><Metric label="Exit now" value={money2(quote.outcomes.exit_now_usd)} /><Metric label="Market midpoint" value={money2(quote.outcomes.market_midpoint_usd)} /><Metric label="Current-book bound" value={money2(quote.outcomes.current_book_bound_usd)} color={C.amber} /><Metric label="Theoretical minimum" value={money2(quote.outcomes.theoretical_minimum_usd)} color={C.red} /></div> : <div className="db-metrics" style={{ marginTop: 12 }}><Metric label="Principal" value={money2(quote.principal_usd)} /><Metric label="Model midpoint" value={money2(quote.outcomes.market_midpoint_usd)} /><Metric label="Schedule minimum" value={money2(quote.outcomes.musdc_minimum_usd)} color={C.amber} /><Metric label="Schedule maximum" value={money2(quote.outcomes.best_case_usd)} color={C.tealLight} /></div>}
      </div>}

      <div className="db-card db-deploy-card">
        <div className="db-card-head"><span className="db-cap">Deploy note</span><span className="db-dim">{!supported ? "mUSDC required" : currency === "dUSDC" ? "PLP + range positions" : quote.autocall_terms ? "isolated testnet observation lifecycle" : "isolated testnet payoff receipt"}</span></div>
        {!supported ? <button className="db-cta" style={{ background: C.tealLight }} disabled>Select mUSDC for Autocall 3</button> : !wallet.connected ? <ConnectModal defaultOpen={false} trigger={<button className="db-cta" style={{ background: C.tealLight }}>Connect a wallet</button>} /> : <button className="db-cta" style={{ background: C.tealLight }} disabled={busy || shortBalance} onClick={deployNote}>{busy ? stage : shortBalance ? `Need more ${currency}` : `Deploy · ${money2(quote.principal_usd)}`}</button>}
        {shortBalance && <div className="db-banner err">Needs {money2(requiredWalletAmount)} {currency} from this wallet; balance is {money2(balance)}.</div>}
        {result && <ResultLine digest={result} label={`${quote.preset.name} deployed`} />}
        {openErr && <div className="db-banner err">{openErr}</div>}
      </div>
    </div>}
  </div>;
}

function NoteOutcomeRows({ quote, currency }: { quote: NoteQuote; currency: Currency }) {
  const values = [
    { label: quote.autocall_terms ? "No knock-in redemption" : currency === "mUSDC" ? "Scheduled reserve" : "Reserve if PLP unchanged", value: quote.outcomes.reserve_if_plp_unchanged_usd, color: C.green },
    { label: "Market midpoint", value: quote.outcomes.market_midpoint_usd, color: C.textPrimary },
    { label: "Best case", value: quote.outcomes.best_case_usd, color: C.tealLight },
    { label: currency === "mUSDC" ? "Schedule minimum" : "Theoretical minimum", value: currency === "mUSDC" ? quote.outcomes.musdc_minimum_usd : quote.outcomes.theoretical_minimum_usd, color: C.red },
  ];
  const max = Math.max(...values.map((item) => item.value), quote.principal_usd, 1);
  return <div className="db-proj">{values.map((item) => <ProjRow key={item.label} label={item.label} value={money2(item.value)} note={pctSigned(((item.value - quote.principal_usd) / quote.principal_usd) * 100)} color={item.color} width={(item.value / max) * 100} barColor={item.color} />)}</div>;
}

function TerminalPayoffLadder({ bands, capital, accent }: { bands: TerminalBand[]; capital: number; accent: string }) {
  if (bands.length === 0) return <div className="db-payoff-empty">No terminal bands for this lifecycle product.</div>;
  const visible = bands.length > 12 ? bands.filter((_, index) => index === 0 || index === bands.length - 1 || index % 2 === 1) : bands;
  const max = Math.max(...visible.map((band) => band.payout_usd), capital, 1);
  return <div className="db-terminal-ladder">{visible.map((band) => <div key={`${band.lower_usd}-${band.higher_usd}`}><span>{band.lower_usd <= 0 ? "Below" : money(band.lower_usd)}–{band.higher_usd >= 1_000_000_000 ? "Above" : money(band.higher_usd)}</span><i><b style={{ width: `${Math.max(3, (band.payout_usd / max) * 100)}%`, background: band.payout_usd >= capital ? accent : C.amber }} /></i><strong>{money2(band.payout_usd)}</strong></div>)}</div>;
}

// ───────────────────────── small shared bits ─────────────────────────
function Metric({ label, value, color, hint }: { label: string; value: string; color?: string; hint?: string }) {
  return (
    <div className="db-metric">
      <span className="db-metric-k">{label}{hint && <i>{hint}</i>}</span>
      <strong style={color ? { color } : undefined}>{value}</strong>
    </div>
  );
}
function Greek({ sym, name, val, unit, color }: { sym: string; name: string; val: string; unit?: string; color?: string }) {
  return (
    <div className="db-greek">
      <span className="db-greek-k">{sym}<i>{name}</i></span>
      <strong style={color ? { color } : undefined}>{val}{unit && <em>{unit}</em>}</strong>
    </div>
  );
}
function RouteHandle({ k, v }: { k: string; v: string }) {
  return (
    <div className="db-rh">
      <span>{k}</span>
      <strong title={v}>{v}</strong>
    </div>
  );
}
function DeployStat({ label, value, color, hint }: { label: string; value: string; color?: string; hint?: string }) {
  return (
    <div className="db-dstat">
      <span>{label}{hint && <i> · {hint}</i>}</span>
      <strong style={color ? { color } : undefined}>{value}</strong>
    </div>
  );
}
function ProjRow({ label, value, note, color, width, barColor }: { label: string; value: string; note: string; color: string; width: number; barColor: string }) {
  return (
    <div className="db-proj-row">
      <div className="db-proj-top">
        <span className="db-proj-label">{label}</span>
        <span className="db-proj-val" style={{ color }}>{value}<i>{note}</i></span>
      </div>
      <div className="db-proj-track"><span style={{ width: `${Math.max(2, Math.min(100, width))}%`, background: barColor }} /></div>
    </div>
  );
}


// The signature Range Strips visual: a DeepBook-style price LADDER — the range
// bands you're betting, stacked high→low price, each with a bar sized by its
// payout and the band holding the forward marked. Reads as an order-book depth
// ladder — distinct from Distribution's density curve and Volatility's vol surface.
// Basic shows this clean bar ladder; Advanced adds the full bid/ask table below.
function RangeLadder({ quote, accent }: { quote: DeepBookQuote; accent: string }) {
  const bands = quote.strip.buckets.filter((b) => b.tradeable && Number(b.quantity) > 0);
  if (bands.length === 0) return <div className="db-payoff-empty" style={{ height: 200 }}>no tradeable price bands right now</div>;
  const maxPay = Math.max(...bands.map((b) => ui(b.max_payout_raw)), 1);
  const fwd = quote.forward_usd;
  const realizedMax = ui(quote.strip.realized_max_payout_raw);
  const rows = [...bands].sort((a, b) => b.lower_usd - a.lower_usd); // high price at top (DOM style)
  return (
    <div className="db-rl-wrap">
      <div className="db-rl">
        {rows.map((b) => {
          const pay = ui(b.max_payout_raw);
          const isFwd = fwd > b.lower_usd && fwd <= b.higher_usd;
          const isMax = pay >= maxPay - 0.5;
          return (
            <div className={`db-rl-row${isFwd ? " is-fwd" : ""}${isMax ? " is-max" : ""}`} key={`${b.lower}-${b.higher}`}>
              <span className="db-rl-band">
                {money(b.lower_usd)}–{money(b.higher_usd)}
                {isFwd && <em>fwd</em>}
                {isMax && <em className="best" style={{ color: accent, borderColor: `${accent}66` }}>best</em>}
              </span>
              <span className="db-rl-track"><i style={{ width: `${Math.max(4, (pay / maxPay) * 100)}%`, background: accent }} /></span>
              <span className="db-rl-pay">{money(pay)}</span>
            </div>
          );
        })}
      </div>
      <p className="db-rl-note">
        BTC settles in <b>one</b> band. Best case pays <b style={{ color: accent }}>{money(realizedMax)}</b> if it lands in the top band; a miss expires at $0 — max loss is your premium.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
const DB_CSS = `
  .db { max-width: 1640px; margin: 0 auto; display: grid; gap: 16px; min-width: 0; }
  .db-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; flex-wrap: wrap; }
  .db-eyebrow { font-family: ${FM}; font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: ${C.teal}; }
  .db-head h1 { margin: 7px 0 0; font-family: ${FD}; font-size: 30px; font-weight: 600; letter-spacing: 0; color: ${C.textPrimary}; }
  .db-head p { margin: 9px 0 0; max-width: 620px; font-family: ${FS}; font-size: 13px; line-height: 1.55; color: ${C.textSecondary}; }
  .db-tabs { display: inline-flex; gap: 3px; padding: 3px; border-radius: 10px; border: 0.5px solid ${C.border}; background: ${C.surface}; flex-shrink: 0; }
  .db-tabs button { appearance: none; border: 0; background: transparent; border-radius: 7px; padding: 9px 16px; color: ${C.textSecondary}; font-family: ${FM}; font-size: 11.5px; letter-spacing: 0.02em; cursor: pointer; transition: all 0.15s ${EASE}; }
  .db-tabs button:hover { color: ${C.textPrimary}; }
  .db-tabs button.is-on { background: ${C.card}; color: ${C.textPrimary}; box-shadow: 0 1px 0 ${C.border}; }
  @media (max-width: 560px) {
    .db-head { width: 100%; }
    .db-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); width: 100%; }
    .db-tabs button { min-width: 0; padding: 9px 4px; font-size: 10px; white-space: nowrap; }
  }

  .db-surface { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; min-width: 0; }
  .db-card { border: 0.5px solid ${C.border}; background: ${C.card}; border-radius: 14px; padding: 15px 16px; min-width: 0; }
  .db-card-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 12px; }
  .db-cap { font-family: ${FM}; font-size: 9.5px; letter-spacing: 0.13em; text-transform: uppercase; color: ${C.textMuted}; }
  .db-dim { font-family: ${FM}; font-size: 10px; color: ${C.textMuted}; }

  .db-banner { border-radius: 10px; padding: 12px 14px; font-family: ${FM}; font-size: 12px; line-height: 1.5; }
  .db-banner.err { border: 0.5px solid ${C.red}55; background: ${C.redBg}; color: ${C.red}; }
  .db-empty { display: grid; place-items: center; min-height: 180px; font-family: ${FM}; font-size: 12px; color: ${C.textMuted}; }
  .db-skel { border-radius: 14px; background: linear-gradient(90deg, ${C.card}, ${C.surface}, ${C.card}); background-size: 200% 100%; animation: db-sk 1.4s ${EASE} infinite; }
  @keyframes db-sk { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  /* strategy / preset cards — flex with centered wrap so 7 cards never leave a
     ragged empty cell: the trailing row (3) centers under a full row of 4. */
  .db-strat-grid { display: flex; flex-wrap: wrap; gap: 11px; justify-content: flex-start; }
  .db-strat-grid > .db-strat { flex: 1 1 180px; max-width: calc((100% - 66px) / 7); }
  @media (max-width: 1400px) { .db-strat-grid > .db-strat { max-width: calc((100% - 33px) / 4); } }
  @media (max-width: 980px) { .db-strat-grid > .db-strat { max-width: calc((100% - 22px) / 3); } }
  @media (max-width: 640px) { .db-strat-grid > .db-strat { max-width: calc((100% - 11px) / 2); } }
  /* All presets on one clean row (no lonely wrap). Cards grow to fill; any wrap
     at narrower widths centers so a half-row never reads as "stuck out". */
  .db-note-grid { display: flex; flex-wrap: wrap; gap: 11px; justify-content: center; }
  .db-note-grid > .db-strat { flex: 1 1 200px; min-width: 0; max-width: calc((100% - 66px) / 7); }
  @media (max-width: 1340px) { .db-note-grid > .db-strat { max-width: calc((100% - 33px) / 4); } }
  @media (max-width: 860px) { .db-note-grid > .db-strat { max-width: calc((100% - 11px) / 2); } }
  @media (max-width: 560px) { .db-note-grid > .db-strat { max-width: 100%; } }
  /* Basic mode shows a curated 3 — widen the cards so the trio fills the row. */
  .db-strat-grid.is-basic > .db-strat, .db-note-grid.is-basic > .db-strat { max-width: calc((100% - 22px) / 3); }
  .db-yield-grid > .db-strat { max-width: calc((100% - 33px) / 4); }
  @media (max-width: 980px) { .db-yield-grid > .db-strat { max-width: calc((100% - 11px) / 2); } }
  @media (max-width: 820px) { .db-strat-grid.is-basic > .db-strat, .db-note-grid.is-basic > .db-strat { max-width: calc((100% - 11px) / 2); } }
  @media (max-width: 560px) { .db-strat-grid.is-basic > .db-strat, .db-note-grid.is-basic > .db-strat { max-width: 100%; } }
  @media (max-width: 560px) { .db-yield-grid > .db-strat { max-width: 100%; } }
  .db-strat { text-align: left; display: grid; gap: 7px; align-content: start; cursor: pointer; transition: all 0.15s ${EASE}; }
  .db-strat:hover { border-color: ${C.borderHover}; transform: translateY(-1px); }
  .db-strat-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .db-strat-tags { display: inline-flex; gap: 5px; }
  .db-strat b { font-family: ${FD}; font-size: 13.5px; font-weight: 600; color: ${C.textPrimary}; }
  .db-strat em { font-family: ${FS}; font-style: normal; font-size: 11px; line-height: 1.45; color: ${C.textSecondary}; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; min-height: 47px; }
  .db-strat-foot { font-family: ${FM}; font-size: 9.5px; color: ${C.textMuted}; text-transform: capitalize; letter-spacing: 0.02em; }
  .db-tag { font-family: ${FM}; font-size: 8.5px; letter-spacing: 0.08em; padding: 2px 6px; border-radius: 5px; border: 0.5px solid; white-space: nowrap; }

  .db-note-stats { display: flex; gap: 14px; flex-wrap: wrap; padding-top: 9px; border-top: 0.5px solid ${C.border}; }
  .db-note-stats span { font-family: ${FM}; font-size: 9.5px; color: ${C.textMuted}; letter-spacing: 0.04em; }
  .db-note-stats b { font-family: ${FD}; font-size: 12px; font-weight: 600; color: ${C.textPrimary}; margin-left: 4px; }

  /* controls — flexible columns aligned to a shared bottom baseline; the segmented
     Expiry control stretches to fill its column instead of floating/overflowing. */
  /* controls: text (left) · expiry options (middle, widest) · order box (right) */
  .db-controls { display: grid; grid-template-columns: minmax(190px, 1fr) minmax(0, 1.9fr) minmax(238px, 268px); gap: 24px; align-items: start; min-width: 0; }
  @media (max-width: 980px) { .db-controls { grid-template-columns: 1fr; } }
  .db-amount, .db-expiry, .db-tenor { display: grid; gap: 8px; min-width: 0; }
  .db-amount-in { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 7px; border: 0.5px solid ${C.border}; background: ${C.surface}; border-radius: 10px; padding: 8px 10px 8px 12px; }
  .db-amount-cur { font-family: ${FD}; font-size: 18px; font-weight: 600; color: ${C.textMuted}; line-height: 1; }
  .db-num { min-width: 0; width: 100%; background: transparent; border: none; outline: none; color: ${C.textPrimary}; font-family: ${FD}; font-size: 21px; font-weight: 600; padding: 0; }
  .db-seg { display: flex; width: 100%; gap: 2px; padding: 3px; border-radius: 9px; border: 0.5px solid ${C.border}; background: ${C.surface}; }
  /* individual-expiry strip (advanced): one compact chip per live oracle, horizontally scrollable so 19 tenors never overlap */
  .db-strike-strip { display: flex; gap: 5px; min-width: 0; overflow-x: auto; overflow-y: hidden; padding-bottom: 5px; scrollbar-width: thin; }
  .db-strike-strip::-webkit-scrollbar { height: 5px; }
  .db-strike-strip::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 999px; }
  .db-strike { flex: 0 0 auto; appearance: none; border: 0.5px solid ${C.border}; background: ${C.surface}; border-radius: 8px; height: 32px; padding: 0 12px; color: ${C.textMuted}; font-family: ${FM}; font-size: 11px; font-weight: 560; white-space: nowrap; cursor: pointer; transition: all 0.13s ${EASE}; }
  .db-strike:hover { color: ${C.textSecondary}; border-color: ${C.borderHover}; }
  .db-strike.is-on { background: ${C.tealBg}; border-color: ${C.tealLight}; color: ${C.tealLight}; }
  .db-seg button { flex: 1; appearance: none; border: 0; background: transparent; border-radius: 6px; padding: 8px 10px; color: ${C.textMuted}; font-family: ${FM}; font-size: 10.5px; cursor: pointer; transition: all 0.14s ${EASE}; text-transform: capitalize; }
  .db-seg button:hover { color: ${C.textSecondary}; }
  .db-seg button.is-on { background: ${C.card}; color: ${C.textPrimary}; }
  .db-schedule-readout { min-height: 35px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 12px; border: 0.5px solid ${C.border}; border-radius: 8px; background: ${C.surface}; }
  .db-schedule-readout strong { font-family: ${FD}; font-size: 11px; color: ${C.textPrimary}; font-weight: 600; white-space: nowrap; }
  .db-schedule-readout span { font-family: ${FM}; font-size: 9.5px; color: ${C.textMuted}; text-align: right; white-space: nowrap; }
  .db-controls-meta { display: grid; gap: 4px; align-content: center; min-width: 0; }
  .db-controls-meta strong { font-family: ${FD}; font-size: 17px; font-weight: 600; color: ${C.textPrimary}; font-variant-numeric: tabular-nums; }
  .db-controls-thesis { font-family: ${FS}; font-size: 11.5px; line-height: 1.45; color: ${C.textSecondary}; }
  .db-range { -webkit-appearance: none; appearance: none; width: 100%; height: 4px; border-radius: 4px; background: ${C.border}; outline: none; }
  .db-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 15px; height: 15px; border-radius: 50%; background: ${C.tealLight}; cursor: pointer; border: none; }
  .db-range::-moz-range-thumb { width: 15px; height: 15px; border-radius: 50%; background: ${C.tealLight}; cursor: pointer; border: none; }

  /* quote layouts */
  /* chart-first layouts — payoff is the full-width hero, supporting cards below/beside */
  .db-basic, .db-adv { display: grid; gap: 14px; min-width: 0; }
  .db-quote-row { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(300px, 1fr); gap: 14px; align-items: stretch; }
  .db-adv-top { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(320px, 0.95fr); gap: 14px; align-items: stretch; }
  @media (max-width: 1000px) { .db-quote-row, .db-adv-top { grid-template-columns: 1fr; } }
  /* right column fills the chart's height: greeks card grows, deploy pins to the bottom so both columns' bottoms align */
  .db-side { display: grid; grid-template-rows: 1fr auto; gap: 14px; min-width: 0; }
  .db-side > .db-card:first-child { display: flex; flex-direction: column; }
  /* quote + deploy: two balanced cards whose inner lists flex-fill to equal height */
  .db-quote-card, .db-deploy-card { display: flex; flex-direction: column; gap: 12px; }
  .db-quote-card .db-metrics { flex: 1; }
  .db-deploy-act { display: flex; flex-direction: column; }
  .db-dsum { flex: 1; display: grid; grid-auto-rows: 1fr; gap: 1px; background: ${C.border}; border: 0.5px solid ${C.border}; border-radius: 10px; overflow: hidden; }
  .db-dsum > div { display: flex; align-items: center; justify-content: space-between; gap: 14px; background: ${C.card}; padding: 11px 13px; }
  .db-dsum-k { font-family: ${FM}; font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.textMuted}; white-space: nowrap; }
  .db-dsum-v { font-family: ${FD}; font-size: 12.5px; font-weight: 600; color: ${C.textPrimary}; font-variant-numeric: tabular-nums; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* Both columns share the row's height; the shorter (left) card distributes its
     content so its bottom edge lines up with the right column's deploy button. */
  .db-quote-grid { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(310px, 0.95fr); gap: 14px; align-items: stretch; }
  .db-adv-grid { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(320px, 0.92fr); gap: 14px; align-items: stretch; }
  .db-quote-grid > .db-card:first-child { display: flex; flex-direction: column; }
  .db-quote-grid > .db-card:first-child > .db-proj { flex: 1 1 auto; align-content: space-between; }
  @media (max-width: 1100px) { .db-quote-grid, .db-adv-grid { grid-template-columns: 1fr; } }

  .db-payoff p.db-risk { margin: 10px 0 0; font-family: ${FS}; font-size: 11px; line-height: 1.5; color: ${C.textMuted}; }
  .db-payoff-empty { display: grid; place-items: center; font-family: ${FM}; font-size: 11px; color: ${C.textMuted}; }

  .db-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: ${C.border}; border: 0.5px solid ${C.border}; border-radius: 10px; overflow: hidden; }
  .db-metric { background: ${C.card}; padding: 11px 13px; display: grid; gap: 4px; align-content: center; }
  .db-metric-k { font-family: ${FM}; font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.textMuted}; display: flex; align-items: baseline; gap: 6px; }
  .db-metric-k i { font-style: normal; font-size: 8.5px; opacity: 0.7; }
  .db-metric strong { font-family: ${FD}; font-size: 16px; font-weight: 600; color: ${C.textPrimary}; font-variant-numeric: tabular-nums; }

  .db-cta { width: 100%; height: 44px; border: none; border-radius: 11px; color: #04121d; font-family: ${FD}; font-size: 13.5px; font-weight: 600; cursor: pointer; transition: transform 0.15s ${EASE}, opacity 0.15s ${EASE}; }
  .db-cta:hover:not(:disabled) { transform: translateY(-1px); }
  .db-cta:disabled { opacity: 0.5; cursor: not-allowed; }
  .db-note { margin: 11px 0 0; font-family: ${FS}; font-size: 10.5px; line-height: 1.5; color: ${C.textMuted}; }

  /* shared table cells — used by the advanced price ladder + notes sleeve table */
  .db-band { color: ${C.textSecondary}; }
  .db-slip { color: ${C.textMuted}; }

  /* advanced: the DeepBook price ladder — bid/ask + exit-now. The surface's identity. */
  .db-ladder { border: 0.5px solid ${C.border}; border-radius: 10px; overflow: hidden; }
  .db-lrow { display: grid; grid-template-columns: minmax(0, 1.35fr) 1.1fr 0.6fr 1fr 1.05fr 1fr; gap: 12px; align-items: center; padding: 8px 14px; border-bottom: 0.5px solid ${C.border}; font-family: ${FM}; font-size: 11px; color: ${C.textPrimary}; font-variant-numeric: tabular-nums; }
  .db-lrow:last-child { border-bottom: 0; }
  .db-lrow > span:not(.db-band):not(.db-ldepth):not(.db-lh-depth) { text-align: right; }
  .db-lrow.is-dim { opacity: 0.36; }
  .db-lrow-h { background: ${C.surface}; font-size: 8.5px; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.textMuted}; }
  .db-lrow-tot { background: ${C.surface}; font-weight: 600; }
  .db-lrow-tot .db-band { color: ${C.textPrimary}; }
  .db-lh-depth { text-align: left; }
  .db-ldepth { display: block; height: 6px; border-radius: 3px; background: ${C.surface}; overflow: hidden; }
  .db-ldepth i { display: block; height: 100%; border-radius: 3px; opacity: 0.85; transition: width 0.35s ${EASE}; }
  .db-mtm { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: ${C.border}; border: 0.5px solid ${C.border}; border-radius: 10px; overflow: hidden; margin-top: 12px; }
  .db-mtm > div { background: ${C.card}; padding: 11px 13px; display: grid; gap: 6px; align-content: center; }
  .db-mtm strong { font-family: ${FD}; font-size: 16px; font-weight: 600; color: ${C.textPrimary}; font-variant-numeric: tabular-nums; }

  /* basic: the plain-English outcome sentence under the payoff hero */
  .db-outcome-line { margin: 13px 0 0; font-family: ${FS}; font-size: 15px; line-height: 1.5; color: ${C.textSecondary}; letter-spacing: 0; }
  .db-outcome-line b { font-family: ${FD}; font-weight: 600; color: ${C.textPrimary}; }

  /* the Range Strips signature visual: a price/payout LADDER (bands + depth bars, DOM style) */
  .db-rl { display: grid; gap: 5px; padding: 4px 0; }
  .db-rl-row { display: grid; grid-template-columns: minmax(120px, auto) minmax(0, 1fr) minmax(96px, auto); gap: 14px; align-items: center; padding: 5px 10px; border-radius: 8px; transition: background 0.15s ${EASE}; }
  .db-rl-row.is-fwd { background: ${C.surface}; }
  .db-rl-band { font-family: ${FM}; font-size: 11.5px; color: ${C.textSecondary}; font-variant-numeric: tabular-nums; white-space: nowrap; display: inline-flex; align-items: baseline; gap: 7px; }
  .db-rl-band em { font-family: ${FM}; font-style: normal; font-size: 8px; letter-spacing: 0.09em; text-transform: uppercase; color: ${C.textMuted}; border: 0.5px solid ${C.border}; border-radius: 4px; padding: 1px 4px; }
  .db-rl-track { height: 18px; border-radius: 5px; background: ${C.surface}; overflow: hidden; }
  .db-rl-track i { display: block; height: 100%; border-radius: 5px; opacity: 0.85; transition: width 0.4s ${EASE}; }
  .db-rl-pay { font-family: ${FD}; font-size: 13px; font-weight: 600; color: ${C.textPrimary}; font-variant-numeric: tabular-nums; white-space: nowrap; text-align: right; }
  /* center the ladder in its hero card (kills dead space when a directional play has few bands) */
  .db-payoff.db-hero { display: flex; flex-direction: column; }
  .db-rl-wrap { display: flex; flex-direction: column; justify-content: center; gap: 12px; flex: 1; }
  .db-rl-note { margin: 0; font-family: ${FS}; font-size: 11.5px; line-height: 1.5; color: ${C.textMuted}; }
  .db-rl-note b { font-family: ${FD}; font-weight: 600; color: ${C.textSecondary}; }
  .db-rl-row.is-max { background: ${C.surface}; }
  .db-rl-row.is-max .db-rl-pay { color: ${C.textPrimary}; }

  .db-rh { background: ${C.card}; padding: 9px 12px; display: grid; gap: 3px; }
  .db-rh span { font-family: ${FM}; font-size: 8.5px; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.textMuted}; }
  .db-rh strong { font-family: ${FD}; font-size: 12px; font-weight: 600; color: ${C.textPrimary}; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .db-greeks { display: grid; grid-template-columns: 1fr 1fr; grid-auto-rows: 1fr; gap: 9px; flex: 1; }
  .db-greek { border: 0.5px solid ${C.border}; background: ${C.surface}; border-radius: 10px; padding: 10px 12px; display: grid; gap: 5px; align-content: center; }
  .db-greek-k { font-family: ${FM}; font-size: 11px; color: ${C.textSecondary}; display: flex; align-items: baseline; gap: 5px; }
  .db-greek-k i { font-style: normal; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.05em; color: ${C.textMuted}; }
  .db-greek strong { font-family: ${FD}; font-size: 16px; font-weight: 600; color: ${C.textPrimary}; font-variant-numeric: tabular-nums; }
  .db-greek strong em { font-family: ${FM}; font-size: 9px; font-style: normal; color: ${C.textMuted}; margin-left: 3px; }
  .db-greek-foot { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: ${C.border}; border: 0.5px solid ${C.border}; border-radius: 10px; overflow: hidden; margin-top: 10px; }

  /* notes narrative */
  .db-narrative { display: grid; gap: 11px; }
  .db-flow { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .db-flow-step { display: inline-flex; align-items: center; gap: 7px; font-family: ${FM}; font-size: 11px; color: ${C.textSecondary}; }
  .db-flow-step i { width: 8px; height: 8px; border-radius: 2px; flex: 0 0 auto; }
  .db-flow-arr { font-family: ${FM}; font-size: 13px; color: ${C.textMuted}; }

  /* basic note projected */
  .db-proj { display: grid; gap: 14px; }
  .db-proj-row { display: grid; gap: 6px; }
  .db-proj-top { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
  .db-proj-label { font-family: ${FM}; font-size: 10px; letter-spacing: 0.05em; text-transform: uppercase; color: ${C.textMuted}; }
  .db-proj-val { font-family: ${FD}; font-size: 17px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .db-proj-val i { font-family: ${FM}; font-size: 10px; font-style: normal; color: ${C.textMuted}; margin-left: 8px; }
  .db-proj-track { height: 8px; border-radius: 5px; background: ${C.surface}; overflow: hidden; }
  .db-proj-track span { display: block; height: 100%; border-radius: 5px; transition: width 0.3s ${EASE}; }

  .db-sleeve { display: grid; gap: 1px; background: ${C.border}; border: 0.5px solid ${C.border}; border-radius: 10px; overflow: hidden; }
  .db-sleeve-row { background: ${C.card}; display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: baseline; padding: 10px 13px; }
  .db-sleeve-pool { font-family: ${FD}; font-size: 13px; font-weight: 600; color: ${C.textPrimary}; }
  .db-sleeve-apy { font-family: ${FM}; font-size: 12px; font-variant-numeric: tabular-nums; }
  .db-sleeve-alloc { font-family: ${FD}; font-size: 13px; color: ${C.textSecondary}; font-variant-numeric: tabular-nums; }

  /* advanced sleeve table */
  .db-sleeve-table { border: 0.5px solid ${C.border}; border-radius: 10px; overflow: hidden; }
  .db-srow { display: grid; grid-template-columns: minmax(0, 1.4fr) 0.9fr 1.1fr 0.7fr 1.2fr; gap: 8px; align-items: center; padding: 9px 13px; border-bottom: 0.5px solid ${C.border}; font-family: ${FM}; font-size: 11.5px; color: ${C.textPrimary}; font-variant-numeric: tabular-nums; }
  .db-srow:last-child { border-bottom: 0; }
  .db-srow span:not(.db-band) { text-align: right; }
  .db-srow-h { background: ${C.surface}; font-size: 8.5px; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.textMuted}; }
  .db-srow-tot { background: ${C.surface}; font-weight: 600; }

  .db-deployed { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; background: ${C.border}; border: 0.5px solid ${C.border}; border-radius: 10px; overflow: hidden; }
  .db-dstat { background: ${C.card}; padding: 10px 13px; display: grid; gap: 4px; }
  .db-dstat span { font-family: ${FM}; font-size: 8.5px; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.textMuted}; }
  .db-dstat span i { font-style: normal; opacity: 0.72; }
  .db-dstat strong { font-family: ${FD}; font-size: 14px; font-weight: 600; color: ${C.textPrimary}; font-variant-numeric: tabular-nums; }


  .db-alloc-bar { display: flex; gap: 2px; height: 12px; border-radius: 6px; overflow: hidden; }
  .db-alloc-bar span { display: block; height: 100%; }
  .db-alloc-key { display: flex; justify-content: space-between; gap: 12px; margin-top: 11px; flex-wrap: wrap; }
  .db-alloc-key span { display: inline-flex; align-items: center; gap: 6px; font-family: ${FM}; font-size: 10px; color: ${C.textMuted}; }
  .db-alloc-key i { width: 7px; height: 7px; border-radius: 2px; flex: 0 0 auto; }
  .db-alloc-key b { font-family: ${FD}; color: ${C.textPrimary}; font-weight: 600; margin-left: 2px; }

  /* PLP yield terminal */
  .db-yield-basic { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr) minmax(270px, .72fr); gap: 14px; align-items: stretch; }
  .db-yield-basic .db-position-card { grid-column: 1 / -1; }
  .db-yield-advanced { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1.15fr) minmax(280px, .78fr); gap: 14px; align-items: stretch; }
  .db-yield-advanced .db-model-card { grid-column: 1 / 3; }
  .db-yield-advanced .db-position-card { grid-column: 3; }
  .db-yield-health { display: grid; gap: 9px; min-width: 0; }
  .db-health-line { display: grid; grid-template-columns: minmax(80px, 1fr) auto auto; gap: 10px; align-items: center; }
  .db-health-line > span { height: 7px; overflow: hidden; border-radius: 4px; background: ${C.surface}; }
  .db-health-line > span i { display: block; height: 100%; background: ${C.green}; border-radius: 4px; }
  .db-health-line b, .db-health-line em { font-family: ${FM}; font-size: 10px; font-style: normal; color: ${C.textSecondary}; white-space: nowrap; }
  .db-health-line em { color: ${C.textMuted}; }
  .db-capital-stack { display: flex; width: 100%; height: 16px; gap: 2px; overflow: hidden; border-radius: 6px; background: ${C.surface}; }
  .db-capital-stack > span { display: block; min-width: 2px; height: 100%; }
  .db-stack-rows { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; margin-top: 12px; overflow: hidden; border: 0.5px solid ${C.border}; border-radius: 8px; background: ${C.border}; }
  .db-scenario-list { display: grid; gap: 10px; }
  .db-scenario { display: grid; grid-template-columns: minmax(130px, .85fr) minmax(100px, 1fr) minmax(108px, auto); gap: 12px; align-items: center; }
  .db-scenario > span { font-family: ${FM}; font-size: 10px; color: ${C.textSecondary}; }
  .db-scenario > i { height: 8px; overflow: hidden; border-radius: 4px; background: ${C.surface}; }
  .db-scenario > i b { display: block; height: 100%; border-radius: 4px; }
  .db-scenario > strong { font-family: ${FD}; font-size: 13px; color: ${C.textPrimary}; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .db-scenario > strong em { display: block; margin-top: 2px; font-family: ${FM}; font-size: 8.5px; font-style: normal; color: ${C.textMuted}; }
  .db-position-line { display: flex; align-items: center; justify-content: space-between; gap: 14px; min-height: 56px; }
  .db-position-line > div { display: grid; gap: 3px; min-width: 0; }
  .db-position-line strong { font-family: ${FD}; font-size: 20px; font-weight: 600; color: ${C.textPrimary}; }
  .db-position-line span { font-family: ${FM}; font-size: 9.5px; color: ${C.textMuted}; }
  .db-position-actions { display: flex !important; grid-auto-flow: initial; flex-wrap: wrap; justify-content: flex-end; gap: 8px !important; }
  .db-secondary { height: 34px; border: 0.5px solid ${C.borderHover}; border-radius: 7px; background: ${C.surface}; padding: 0 13px; color: ${C.textSecondary}; font-family: ${FM}; font-size: 10px; cursor: pointer; white-space: nowrap; }
  .db-secondary:disabled { opacity: .4; cursor: not-allowed; }

  /* funded notes */
  .db-note-basic { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.2fr) minmax(270px, .72fr); gap: 14px; align-items: stretch; }
  .db-note-advanced { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1.15fr) minmax(280px, .78fr); gap: 14px; align-items: stretch; }
  .db-note-advanced .db-allocation-card { grid-column: 1 / 3; }
  .db-warn { border: 0.5px solid ${C.amber}55; background: ${C.amber}10; color: ${C.amber}; }
  .db-terminal-ladder { display: grid; gap: 6px; max-height: 330px; overflow-y: auto; padding-right: 3px; }
  .db-terminal-ladder > div { display: grid; grid-template-columns: minmax(126px, auto) minmax(80px, 1fr) 82px; gap: 10px; align-items: center; }
  .db-terminal-ladder span { font-family: ${FM}; font-size: 9.5px; color: ${C.textSecondary}; white-space: nowrap; }
  .db-terminal-ladder i { height: 12px; overflow: hidden; border-radius: 4px; background: ${C.surface}; }
  .db-terminal-ladder i b { display: block; height: 100%; border-radius: 4px; }
  .db-terminal-ladder strong { font-family: ${FD}; font-size: 11.5px; color: ${C.textPrimary}; text-align: right; font-variant-numeric: tabular-nums; }
  .db-observations { display: grid; gap: 1px; overflow: hidden; border: 0.5px solid ${C.border}; border-radius: 8px; background: ${C.border}; }
  .db-observations > div { position: relative; display: grid; grid-template-columns: 72px minmax(0, 1fr) auto; gap: 12px; align-items: center; min-height: 48px; padding: 9px 42px 9px 12px; background: ${C.card}; }
  .db-observations span, .db-observations em { font-family: ${FM}; font-size: 9.5px; font-style: normal; color: ${C.textMuted}; }
  .db-observations strong { font-family: ${FD}; font-size: 12px; color: ${C.textPrimary}; }
  .db-observations b { position: absolute; right: 12px; display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: ${C.violet}22; color: ${C.violet}; font-family: ${FM}; font-size: 9px; }
  .db-ki-line { display: grid; grid-template-columns: auto auto 1fr; gap: 12px; align-items: baseline; margin-top: 12px; padding: 10px 12px; border-radius: 8px; background: ${C.redBg}; }
  .db-ki-line span, .db-ki-line em { font-family: ${FM}; font-size: 9.5px; font-style: normal; color: ${C.textMuted}; }
  .db-ki-line strong { font-family: ${FD}; font-size: 13px; color: ${C.red}; }
  .db-ki-line em { text-align: right; }
  .db-reconcile { display: grid; grid-template-columns: 1fr auto 1fr auto 1fr auto 1fr; gap: 9px; align-items: center; }
  .db-reconcile > div { display: grid; gap: 4px; min-width: 0; padding: 10px 12px; border-radius: 8px; background: ${C.surface}; }
  .db-reconcile span { font-family: ${FM}; font-size: 8.5px; text-transform: uppercase; color: ${C.textMuted}; }
  .db-reconcile strong { font-family: ${FD}; font-size: 14px; color: ${C.textPrimary}; font-variant-numeric: tabular-nums; }
  .db-reconcile > i { font-family: ${FM}; font-size: 13px; font-style: normal; color: ${C.textMuted}; }

  @media (max-width: 1180px) {
    .db-yield-basic, .db-yield-advanced, .db-note-basic, .db-note-advanced { grid-template-columns: 1fr 1fr; }
    .db-yield-advanced .db-model-card, .db-note-advanced .db-allocation-card, .db-yield-basic .db-position-card, .db-yield-advanced .db-position-card { grid-column: 1 / -1; }
  }
  @media (max-width: 760px) {
    .db-yield-basic, .db-yield-advanced, .db-note-basic, .db-note-advanced { grid-template-columns: 1fr; }
    .db-yield-advanced .db-model-card, .db-note-advanced .db-allocation-card, .db-yield-basic .db-position-card, .db-yield-advanced .db-position-card { grid-column: auto; }
    .db-health-line { grid-template-columns: 1fr auto; }
    .db-health-line em { grid-column: 1 / -1; }
    .db-scenario { grid-template-columns: 1fr 90px; }
    .db-scenario > i { grid-column: 1 / -1; grid-row: 2; }
    .db-reconcile { grid-template-columns: 1fr 1fr; }
    .db-reconcile > i { display: none; }
    .db-observations > div { grid-template-columns: 68px 1fr; }
    .db-observations em { grid-column: 2; }
    .db-ki-line { grid-template-columns: auto 1fr; }
    .db-ki-line em { grid-column: 1 / -1; text-align: left; }
    .db-mtm { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .db-terminal-ladder > div { grid-template-columns: minmax(96px, auto) minmax(40px, 1fr) 66px; gap: 6px; }
    .db-terminal-ladder span { font-size: 8.5px; }
    .db-terminal-ladder strong { font-size: 10.5px; }
  }
`;

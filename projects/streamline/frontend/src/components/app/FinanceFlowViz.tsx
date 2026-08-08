"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type SplitLeg = { label: string; pct: number; yield?: boolean };

type FlowBaseProps = {
  compact?: boolean;
  landing?: boolean;
  phone?: boolean;
  progress?: number;
};

type YieldSplitFlowProps = FlowBaseProps & {
  legs?: SplitLeg[];
  dripUsd?: number;
};

type BorrowFlowProps = FlowBaseProps;

const DEFAULT_LEGS: SplitLeg[] = [
  { label: "Spending wallet", pct: 70, yield: false },
  { label: "Scallop (yield)", pct: 30, yield: true },
];

function useAnimatedProgress(external?: number) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (external !== undefined) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1200);
    return () => window.clearInterval(id);
  }, [external]);
  return external ?? (tick % 10) / 10;
}

function nodeAccentClass(
  accent: "yield" | "wallet" | "lender" | "you" | "stream" | undefined,
  landing?: boolean,
  phone?: boolean
) {
  if (phone) {
    if (accent === "yield")
      return "border-[#1d9e75]/30 bg-[#1d9e75]/[0.1] shadow-[0_2px_12px_rgba(29,158,117,0.08)]";
    if (accent === "lender")
      return "border-[#c0533a]/25 bg-[#c0533a]/[0.08] shadow-[0_2px_12px_rgba(192,83,58,0.06)]";
    if (accent === "you")
      return "border-white/60 bg-white/80 shadow-[0_4px_20px_rgba(0,0,0,0.05)]";
    if (accent === "stream")
      return "border-white/60 bg-white/75 shadow-[0_4px_24px_rgba(0,0,0,0.06)]";
    return "border-white/50 bg-white/65 shadow-[0_2px_12px_rgba(0,0,0,0.04)]";
  }
  if (accent === "yield")
    return landing
      ? "border-[#1d9e75]/35 bg-[#1d9e75]/[0.08]"
      : "border-[#1d9e75]/40 bg-[#1d9e75]/[0.06]";
  if (accent === "lender")
    return landing
      ? "border-[#c0533a]/30 bg-[#c0533a]/[0.06]"
      : "border-[#c0533a]/35 bg-[#c0533a]/[0.05]";
  if (accent === "you")
    return landing
      ? "border-black/15 bg-black/[0.04]"
      : "border-[#2b2a5e]/20 bg-[#2b2a5e]/[0.03]";
  if (accent === "stream")
    return landing
      ? "border-black/20 bg-black/[0.05]"
      : "border-[#2b2a5e]/25 bg-[#2b2a5e]/[0.04]";
  return landing
    ? "border-black/12 bg-white/60"
    : "border-[#2b2a5e]/15 bg-white";
}

function FlowNode({
  label,
  sub,
  accent,
  landing,
  phone,
  compact,
  grow,
}: {
  label: string;
  sub?: string;
  accent?: "yield" | "wallet" | "lender" | "you" | "stream";
  landing?: boolean;
  phone?: boolean;
  compact?: boolean;
  grow?: number;
}) {
  const textMain = phone || landing ? "text-[#111]" : "text-[#2b2a5e]";
  const textSub = phone || landing ? "text-[#666]" : "text-[#2b2a5e]/55";

  return (
    <div
      className={`relative rounded-xl border px-3 py-2 backdrop-blur-md ${nodeAccentClass(accent, landing, phone)} ${
        compact ? "min-w-0 flex-1" : ""
      }`}
    >
      <p
        className={`font-semibold leading-tight ${
          phone ? "text-[9px]" : compact ? "text-[10px]" : landing ? "text-[11px]" : "text-[12px]"
        } ${textMain}`}
      >
        {label}
      </p>
      {sub && (
        <p
          className={`mt-0.5 tabular leading-snug ${
            phone ? "text-[8px]" : compact ? "text-[9px]" : "text-[10px]"
          } ${textSub}`}
        >
          {sub}
        </p>
      )}
      {grow !== undefined && (
        <div
          className={`mt-1.5 overflow-hidden rounded-full ${
            phone ? "bg-[#1d9e75]/15" : landing ? "bg-black/[0.06]" : "bg-[#1d9e75]/15"
          }`}
        >
          <div
            className="h-1 rounded-full bg-[#1d9e75] transition-[width] duration-700 ease-out"
            style={{ width: `${Math.min(100, 28 + grow * 72)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function FlowLine({
  animated,
  landing,
  phone,
  dashed,
}: {
  animated?: boolean;
  landing?: boolean;
  phone?: boolean;
  dashed?: boolean;
}) {
  const stroke = phone || landing ? "bg-black/12" : "bg-[#2b2a5e]/18";
  const dot = phone ? "bg-[#1d9e75]" : landing ? "bg-[#111]" : "bg-[#1d9e75]";

  return (
    <div
      className={`relative h-px flex-1 ${stroke} ${dashed ? "!bg-transparent border-t border-dashed border-black/18" : ""}`}
    >
      {animated && !dashed && (
        <span
          className={`absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full ${dot} sl-flow-dot-h`}
          aria-hidden
        />
      )}
    </div>
  );
}

const DRIP_USD = 1;
const DRIP_SPLIT = { spend: 0.2, yield: 0.4, borrow: 0.4 } as const;
const DRIP_CYCLE_SEC = 2;
const DRIP_PAUSE = 0.2; // s pause after all dots land

type DropDef = {
  id: "spend" | "yield" | "borrow";
  x: number;
  yStart: number;
  yEnd: number;
  color: string;
  dot: string;
};

const DROPS: DropDef[] = [
  {
    id: "spend",
    x: 20,
    yStart: 0,
    yEnd: 30,
    color: "rgba(0,0,0,0.18)",
    dot: "#555",
  },
  {
    id: "yield",
    x: 50,
    yStart: 0,
    yEnd: 54,
    color: "rgba(29,158,117,0.45)",
    dot: "#1d9e75",
  },
  {
    id: "borrow",
    x: 80,
    yStart: 0,
    yEnd: 82,
    color: "rgba(192,83,58,0.42)",
    dot: "#c0533a",
  },
];

const MAX_LEN = Math.max(...DROPS.map((d) => d.yEnd - d.yStart));
const TRAVEL_SEC = DRIP_CYCLE_SEC - DRIP_PAUSE;
const PCT_PER_SEC = MAX_LEN / TRAVEL_SEC;
const CYCLE_MS = (DRIP_CYCLE_SEC * 1000) | 0;

function useStreamDripCycle() {
  const [tick, setTick] = useState(0);
  const [lands, setLands] = useState({ spend: 0, yield: 0, borrow: 0 });
  const [flash, setFlash] = useState<Record<string, boolean>>({});
  const [streamFlash, setStreamFlash] = useState(false);
  const cycleRef = useRef(0);
  const landedRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const start = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const elapsed = (now - start) % CYCLE_MS;
      const cycle = Math.floor((now - start) / CYCLE_MS);
      if (cycle !== cycleRef.current) {
        cycleRef.current = cycle;
        landedRef.current = {};
      }

      const t = Math.min(TRAVEL_SEC, elapsed / 1000);
      for (const d of DROPS) {
        const len = d.yEnd - d.yStart;
        const traveled = t * PCT_PER_SEC;
        if (traveled >= len && !landedRef.current[d.id]) {
          landedRef.current[d.id] = true;
          setLands((prev) => ({ ...prev, [d.id]: prev[d.id] + 1 }));
          setFlash((prev) => ({ ...prev, [d.id]: true }));
          window.setTimeout(() => {
            setFlash((prev) => ({ ...prev, [d.id]: false }));
          }, 220);
          setStreamFlash(true);
          window.setTimeout(() => setStreamFlash(false), 220);
        }
      }

      setTick(elapsed);
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const tTravel = Math.min(TRAVEL_SEC, tick / 1000);
  const dots = DROPS.map((d) => {
    const len = d.yEnd - d.yStart;
    const traveled = Math.min(len, tTravel * PCT_PER_SEC);
    const dotTop = d.yStart + traveled;
    const onLine = traveled < len;
    return { ...d, len, dotTop, onLine };
  });

  return { dots, lands, flash, streamFlash };
}

/** Landing phone mockup — stream on top, three vertical drips down. */
export function FinancePhonePreview({ progress = 0 }: { progress?: number }) {
  const p = Math.min(1, Math.max(0, progress));
  const { dots, lands, flash, streamFlash } = useStreamDripCycle();

  const spendBal = 20 + p * 10 + lands.spend * DRIP_SPLIT.spend;
  const yieldBal = 40 + p * 20 + lands.yield * DRIP_SPLIT.yield;
  const yieldCompound = lands.yield * 0.06;
  const borrowLeft = Math.max(
    0,
    800 - p * 80 - lands.borrow * DRIP_SPLIT.borrow
  );
  const streamBal =
    4000 -
    p * 100 -
    lands.spend * DRIP_SPLIT.spend -
    lands.yield * DRIP_SPLIT.yield -
    lands.borrow * DRIP_SPLIT.borrow;

  return (
    <div
      className="relative mx-auto flex min-h-0 w-full flex-1 flex-col px-1 pt-2"
      aria-hidden
    >
      <div className="mt-3">
        <PhoneStreamCard wide amount={streamBal} flash={streamFlash} />
      </div>

      <div className="relative mt-2 min-h-[198px] w-full flex-1">
        {dots.map((d) => (
          <div key={`line-${d.id}`} aria-hidden>
            <div
              className="absolute -translate-x-1/2 border-l-[1.5px] border-dashed"
              style={{
                left: `${d.x}%`,
                top: `${d.yStart}%`,
                height: `${d.len}%`,
                borderColor: d.color,
              }}
            />
            {d.onLine && (
              <div
                className="absolute h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${d.x}%`,
                  top: `${d.dotTop}%`,
                  backgroundColor: d.dot,
                }}
              />
            )}
          </div>
        ))}

        {dots.map((d) => {
          const bucketFlash = flash[d.id];
          const pos = {
            left: `${d.x}%`,
            top: `${d.yEnd}%`,
          };
          if (d.id === "spend") {
            return (
              <div
                key={d.id}
                className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                style={pos}
              >
                <PhoneHubBucket
                  label="Spendable"
                  value={`$${spendBal.toFixed(2)}`}
                  hint=""
                  variant="spendable"
                  flash={bucketFlash}
                />
              </div>
            );
          }
          if (d.id === "yield") {
            return (
              <div
                key={d.id}
                className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                style={pos}
              >
                <PhoneHubBucket
                  label="Yield"
                  value={`$${yieldBal.toFixed(2)}`}
                  extra={`+$${yieldCompound.toFixed(2)}`}
                  hint=""
                  variant="yield"
                  flash={bucketFlash}
                />
              </div>
            );
          }
          return (
            <div
              key={d.id}
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
              style={pos}
            >
              <PhoneHubBucket
                label="Borrow"
                value={`$${borrowLeft.toFixed(2)}`}
                hint=""
                variant="borrow"
                flash={bucketFlash}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PhoneStreamCard({
  wide,
  amount,
  flash,
}: {
  wide?: boolean;
  amount: number;
  flash?: boolean;
}) {
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div
      className={`relative rounded-xl border border-black/10 bg-white shadow-[0_6px_28px_rgba(0,0,0,0.08)] transition-[box-shadow,transform] duration-150 ${
        wide ? "w-full px-4 py-3" : "px-4 py-3"
      } ${flash ? "scale-[0.99] shadow-[0_0_0_1px_rgba(0,0,0,0.08)]" : ""}`}
    >
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#888]">
        Live stream
      </p>
      <p className="mt-1 text-[1.35rem] font-bold tabular leading-none text-[#111]">
        ${formatted}
      </p>
      <p className="mt-1.5 text-[9px] font-medium text-[#555]">
        −${DRIP_USD.toFixed(2)} / 2 sec
      </p>
    </div>
  );
}

function PhoneHubBucket({
  label,
  value,
  extra,
  hint,
  variant,
  flash,
}: {
  label: string;
  value: string;
  extra?: string;
  hint: string;
  variant: "spendable" | "yield" | "borrow";
  flash?: boolean;
}) {
  const valueColor =
    variant === "borrow" ? "text-[#c0533a]" : "text-[#111]";

  return (
    <div
      className={`flex h-[72px] w-[104px] flex-col items-center justify-center rounded-xl border border-black/10 bg-white px-2 py-2 text-center shadow-[0_4px_16px_rgba(0,0,0,0.07)] transition-[box-shadow,transform] duration-150 ${
        flash ? "scale-[1.04] shadow-[0_0_0_1px_rgba(29,158,117,0.3)]" : ""
      }`}
    >
      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#888]">
        {label}
      </p>
      <p className={`text-[15px] font-bold tabular leading-tight ${valueColor}`}>
        {value}
      </p>
      {extra && (
        <p className="text-[10px] font-semibold tabular leading-tight text-[#1d9e75]">
          {extra}
        </p>
      )}
      {!extra && <p className="text-[9px] text-[#888]">{hint}</p>}
      {extra && <p className="text-[8px] text-[#888]">{hint}</p>}
    </div>
  );
}

export function YieldSplitFlow({
  compact = false,
  landing = false,
  phone = false,
  legs = DEFAULT_LEGS,
  dripUsd = 0.5,
  progress,
}: YieldSplitFlowProps) {
  const anim = useAnimatedProgress(progress);
  const yieldLeg = legs.find((l) => l.yield);
  const yieldPct = yieldLeg?.pct ?? 30;
  const vaultGrowth = 12.4 + anim * 4.2;

  const legAmounts = useMemo(
    () =>
      legs.map((leg) => ({
        ...leg,
        usd: ((dripUsd * leg.pct) / 100).toFixed(2),
      })),
    [legs, dripUsd]
  );

  const showCaption = (landing || compact) && !phone;

  return (
    <div
      className={`${landing || phone ? "w-full" : ""} ${
        compact && !phone
          ? "rounded-xl border border-black/10 bg-black/[0.02] p-3"
          : phone
            ? "rounded-xl border border-white/50 bg-white/50 p-2.5 backdrop-blur-md"
            : ""
      }`}
      aria-hidden
    >
      {!compact && !landing && !phone && (
        <p className="mb-3 text-[10px] uppercase tracking-[0.14em] text-[#2b2a5e]/45">
          On every drip
        </p>
      )}

      <div className={`flex flex-col ${phone ? "gap-1.5" : compact ? "gap-2" : "gap-2.5"}`}>
        <FlowNode
          label="Live stream"
          sub="$4,000 · 18 days left"
          accent="stream"
          landing={landing}
          phone={phone}
          compact={compact}
        />

        <div className="flex items-center gap-1 px-1">
          <FlowLine animated landing={landing} phone={phone} />
          <span
            className={`shrink-0 tabular font-semibold ${
              phone ? "text-[8px]" : compact ? "text-[9px]" : "text-[10px]"
            } ${phone || landing ? "text-[#888]" : "text-[#2b2a5e]/50"}`}
          >
            +${dripUsd.toFixed(2)}
          </span>
          <FlowLine landing={landing} phone={phone} />
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {legAmounts.map((leg) => (
            <div key={leg.label} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1 px-0.5">
                <FlowLine animated={leg.yield} landing={landing} phone={phone} />
                <span
                  className={`shrink-0 font-bold tabular ${
                    phone ? "text-[8px]" : compact ? "text-[9px]" : "text-[10px]"
                  } ${leg.yield ? "text-[#1d9e75]" : phone || landing ? "text-[#555]" : "text-[#2b2a5e]/70"}`}
                >
                  {leg.pct}%
                </span>
              </div>
              <FlowNode
                label={leg.yield ? "Yield vault" : "Spending"}
                sub={leg.yield ? `+$${vaultGrowth} earned` : `+$${leg.usd} / drip`}
                accent={leg.yield ? "yield" : "wallet"}
                landing={landing}
                phone={phone}
                compact={compact}
                grow={leg.yield ? anim : undefined}
              />
            </div>
          ))}
        </div>
      </div>

      {showCaption && (
        <p
          className={`mt-2.5 leading-snug ${
            compact ? "text-[9px]" : "text-[11px]"
          } ${landing ? "text-[#666]" : "text-[#2b2a5e]/50"}`}
        >
          {yieldPct}% routes into DeFi on every drip — it compounds while you work.
        </p>
      )}
    </div>
  );
}

/** Borrow against stream PV — lump sum now, drips repay the lender. */
export function BorrowFlow({
  compact = false,
  landing = false,
  phone = false,
  progress,
}: BorrowFlowProps) {
  const anim = useAnimatedProgress(progress);
  const borrowed = Math.floor(1080 + anim * 120);
  const dripRepay = (0.35 + anim * 0.08).toFixed(2);

  const showCaption = (landing || compact) && !phone;
  const labelSize = phone ? "text-[7px]" : compact ? "text-[8px]" : "text-[9px]";

  return (
    <div
      className={`${landing || phone ? "w-full" : ""} ${
        compact && !phone
          ? "rounded-xl border border-black/10 bg-black/[0.02] p-3"
          : phone
            ? "rounded-xl border border-white/50 bg-white/50 p-2.5 backdrop-blur-md"
            : ""
      }`}
      aria-hidden
    >
      {!compact && !landing && !phone && (
        <p className="mb-3 text-[10px] uppercase tracking-[0.14em] text-[#2b2a5e]/45">
          Collateralized borrow
        </p>
      )}

      <div className={`flex flex-col ${phone ? "gap-1.5" : compact ? "gap-2" : "gap-2.5"}`}>
        <FlowNode
          label="$3,000 stream"
          sub="2 wks · 90% PV"
          accent="stream"
          landing={landing}
          phone={phone}
          compact={compact}
        />

        <div className="flex flex-col gap-0.5">
          <p className={`px-0.5 font-semibold uppercase tracking-[0.12em] ${labelSize} text-[#888]`}>
            One-time · borrow now
          </p>
          <div className="flex items-stretch gap-1">
            <FlowLine animated landing={landing} phone={phone} />
            <FlowNode
              label="You"
              sub={`$${borrowed.toLocaleString()} today`}
              accent="you"
              landing={landing}
              phone={phone}
              compact={compact}
            />
          </div>
        </div>

        <div className="flex flex-col gap-0.5">
          <p className={`px-0.5 font-semibold uppercase tracking-[0.12em] ${labelSize} text-[#888]`}>
            Each drip · auto-repay
          </p>
          <div className="flex items-stretch gap-1">
            <FlowLine animated dashed landing={landing} phone={phone} />
            <FlowNode
              label="Lender"
              sub={`+$${dripRepay} / drip`}
              accent="lender"
              landing={landing}
              phone={phone}
              compact={compact}
            />
          </div>
          {!phone && (
            <p
              className={`px-0.5 italic ${
                compact ? "text-[8px]" : "text-[9px]"
              } ${landing ? "text-[#999]" : "text-[#2b2a5e]/40"}`}
            >
              Drips skip your wallet — they repay the loan
            </p>
          )}
        </div>
      </div>

      {showCaption && (
        <p
          className={`mt-2.5 leading-snug ${
            compact ? "text-[9px]" : "text-[11px]"
          } ${landing ? "text-[#666]" : "text-[#2b2a5e]/50"}`}
        >
          Get cash upfront. Future drips repay automatically — position improves daily.
        </p>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

const DRIP_CYCLE_SEC = 2;
const DRIP_PAUSE = 0.2;
const LINE_LEN = 100;
const TRAVEL_SEC = DRIP_CYCLE_SEC - DRIP_PAUSE;
const PCT_PER_SEC = LINE_LEN / TRAVEL_SEC;
const CYCLE_MS = DRIP_CYCLE_SEC * 1000;
const DRIP_USD = 1;

const CARD_CLASS =
  "w-full rounded-xl bg-white px-4 py-3 text-left shadow-[0_6px_28px_rgba(0,0,0,0.08)] transition-[box-shadow,transform] duration-150 cursor-pointer select-none";

function usePrivateDripCycle() {
  const [tick, setTick] = useState(0);
  const [lands, setLands] = useState(0);
  const [flash, setFlash] = useState({ stream: false, wallet: false });
  const landedRef = useRef(false);
  const cycleRef = useRef(0);

  useEffect(() => {
    const start = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const elapsed = (now - start) % CYCLE_MS;
      const cycle = Math.floor((now - start) / CYCLE_MS);
      if (cycle !== cycleRef.current) {
        cycleRef.current = cycle;
        landedRef.current = false;
      }

      const t = Math.min(TRAVEL_SEC, elapsed / 1000);
      const traveled = t * PCT_PER_SEC;
      if (traveled >= LINE_LEN && !landedRef.current) {
        landedRef.current = true;
        setLands((n) => n + 1);
        setFlash({ stream: true, wallet: true });
        window.setTimeout(() => setFlash({ stream: false, wallet: false }), 220);
      }

      setTick(elapsed);
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const tTravel = Math.min(TRAVEL_SEC, tick / 1000);
  const traveled = Math.min(LINE_LEN, tTravel * PCT_PER_SEC);
  const dotTop = traveled;
  const onLine = traveled < LINE_LEN;

  return { dotTop, onLine, lands, flash };
}

export function PrivacyPhonePreview({ progress = 0 }: { progress?: number }) {
  const p = Math.min(1, Math.max(0, progress));
  const { dotTop, onLine, lands, flash } = usePrivateDripCycle();
  const [revealed, setRevealed] = useState({ stream: false, wallet: false });

  const streamBal = 4000 - p * 100 - lands * DRIP_USD;
  const walletBal = 86.5 + p * 40 + lands * DRIP_USD;

  const toggle = (key: "stream" | "wallet") =>
    setRevealed((r) => ({ ...r, [key]: !r[key] }));

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col justify-center px-2 py-3">
      <PrivacyRevealCard
        title="Live stream"
        name="Northwind LLC"
        amount={`$${streamBal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        revealed={revealed.stream}
        onToggle={() => toggle("stream")}
        flash={flash.stream}
        hint="−$1.00 / 2 sec"
      />

      <div className="relative mx-auto h-16 w-full">
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-full -translate-x-1/2 border-l-[1.5px] border-dashed border-black/20"
          aria-hidden
        />
        {onLine && (
          <div
            className="pointer-events-none absolute left-1/2 h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#111]/70"
            style={{ top: `${dotTop}%` }}
            aria-hidden
          />
        )}
      </div>

      <PrivacyRevealCard
        title="Your wallet"
        name="You"
        amount={`$${walletBal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        revealed={revealed.wallet}
        onToggle={() => toggle("wallet")}
        flash={flash.wallet}
        hint="+$1.00 / drip"
        zk
      />
    </div>
  );
}

function PrivacyRevealCard({
  title,
  name,
  amount,
  revealed,
  onToggle,
  flash,
  hint,
  zk,
}: {
  title: string;
  name: string;
  amount: string;
  revealed: boolean;
  onToggle: () => void;
  flash?: boolean;
  hint?: string;
  zk?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`${CARD_CLASS} ${
        flash ? "scale-[0.99] shadow-[0_0_0_1px_rgba(0,0,0,0.08)]" : ""
      }`}
      aria-pressed={revealed}
      aria-label={`${title}. ${revealed ? "Hide" : "Reveal"} private details`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#888]">
          {title}
        </p>
        {zk && (
          <span className="rounded-full bg-[#111] px-1.5 py-px text-[6px] font-semibold uppercase tracking-wider text-white">
            zk
          </span>
        )}
      </div>
      <p
        className={`mt-1 max-w-full truncate text-[11px] font-semibold leading-tight ${
          revealed ? "text-[#111]" : "font-mono tracking-widest text-[#111]"
        }`}
      >
        {revealed ? name : "***"}
      </p>
      <p
        className={`mt-1 text-[1.35rem] font-bold tabular leading-none ${
          revealed ? "text-[#111]" : "font-mono tracking-widest text-[#111]"
        }`}
      >
        {revealed ? amount : "$***"}
      </p>
      <p className="mt-1.5 text-[9px] font-medium text-[#888]">
        {revealed ? hint : "tap to reveal"}
      </p>
    </button>
  );
}

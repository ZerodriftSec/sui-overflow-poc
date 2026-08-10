"use client";

import { useEffect, useState } from "react";

const TICK_MS = 1000;
const BASE_TOTAL = 248_500;
const YIELD_PER_SEC = 8.4;

const DEPARTMENTS = [
  {
    name: "Engineering",
    base: 84_200,
    dripPerSec: 4.2,
    contractors: 18,
    status: "Dripping",
  },
  {
    name: "Design",
    base: 31_500,
    dripPerSec: 1.8,
    contractors: 9,
    status: "Approved",
  },
] as const;

const OPS_MEMBERS = [
  { name: "Alex Chen", base: 6_400, dripPerSec: 0.82 },
  { name: "Sam Rivera", base: 5_200, dripPerSec: 0.61 },
  { name: "Jordan Lee", base: 7_300, dripPerSec: 0.94 },
] as const;

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtUsd(n: number, decimals = 0) {
  return `$${fmt(Math.max(0, n), decimals)}`;
}

export function ProPhonePreview({ progress = 0 }: { progress?: number }) {
  const p = Math.min(1, Math.max(0, progress));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const yieldEarned = tick * YIELD_PER_SEC + p * 420;
  const totalPaid = BASE_TOTAL + yieldEarned;

  const departments = DEPARTMENTS.map((d) => ({
    ...d,
    balance: d.base - tick * d.dripPerSec - p * 80,
  }));

  const opsMembers = OPS_MEMBERS.map((m) => ({
    ...m,
    balance: m.base - tick * m.dripPerSec - p * 20,
  }));
  const opsTotal = opsMembers.reduce((sum, m) => sum + m.balance, 0);
  const opsDrip = OPS_MEMBERS.reduce((sum, m) => sum + m.dripPerSec, 0);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col justify-center font-[family-name:var(--font-inter)]">
      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">
        Pay run · Q2 contractors
      </p>
      <p className="mt-2 text-[1.75rem] font-semibold tabular leading-none tracking-tight text-white">
        {fmtUsd(totalPaid)}
      </p>
      <p className="mt-1 text-[10px] font-semibold tabular text-[#1d9e75]">
        +{fmtUsd(yieldEarned, 2)} yield accruing
      </p>
      <p className="mt-1 text-[11px] text-white/45">
        42 payees · 6 departments · streaming
      </p>

      <div className="mt-4 space-y-2">
        {departments.map((row) => (
          <div
            key={row.name}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-white/80">{row.name}</p>
                <p className="text-[10px] text-white/35">
                  {row.contractors} contractors · {row.status}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-semibold tabular text-white/70">
                  {fmtUsd(row.balance)}
                </p>
                <p className="text-[9px] font-medium tabular text-white/40">
                  {row.dripPerSec}/sec
                </p>
              </div>
            </div>
          </div>
        ))}

        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-white/80">Operations</p>
              <p className="text-[10px] text-white/35">
                {OPS_MEMBERS.length} members · Dripping
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-semibold tabular text-white/70">
                {fmtUsd(opsTotal)}
              </p>
              <p className="text-[9px] font-medium tabular text-white/40">
                {opsDrip.toFixed(1)}/sec
              </p>
            </div>
          </div>

          <div className="mt-2.5 space-y-2 border-t border-white/10 pt-2.5">
            {opsMembers.map((member) => (
              <div
                key={member.name}
                className="flex items-center justify-between gap-2 rounded-md bg-white/[0.03] px-2 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-medium text-white/75">
                    {member.name}
                  </p>
                  <p className="text-[8px] text-white/30">Individual stream</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-semibold tabular text-white/65">
                    {fmtUsd(member.balance, 2)}
                  </p>
                  <p className="text-[8px] font-medium tabular text-white/35">
                    {member.dripPerSec}/sec
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

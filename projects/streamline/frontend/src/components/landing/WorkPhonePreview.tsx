"use client";

import { useEffect, useState } from "react";

/**
 * Landing phone mock — multi-level work graph (dark / pro surface).
 */
const CUSTOMERS_TOP = [
  { name: "Acme Retail", amount: "$840" },
  { name: "Lumen Co.", amount: "$2.4k" },
] as const;

const TOOLS_IN = ["Invoices"] as const;
const TOOLS_PAY = ["Payroll", "Streams"] as const;
const TOOLS_NEXT = ["POS", "QR", "Link"] as const;

const ORGS = [
  { name: "Northwind", primary: true },
  { name: "Harbor Inc", primary: false },
] as const;

const PROFESSIONALS = [
  { name: "Maya Chen", role: "Design", rate: 0.42 },
  { name: "Jordan Lee", role: "Eng", rate: 0.61 },
] as const;

const CUSTOMERS_NEXT = [
  { name: "Pixel Studio", via: "Maya", amount: "$180" },
  { name: "Nest Apps", via: "Jordan", amount: "$420" },
] as const;

function fmtUsd(n: number, decimals = 2) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function Stem() {
  return (
    <div className="flex h-2 justify-center" aria-hidden>
      <div className="h-full w-px bg-white/20" />
    </div>
  );
}

function ToolRow({ tools }: { tools: readonly string[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      {tools.map((tool) => (
        <span
          key={tool}
          className="rounded-md border border-white/12 bg-white/[0.06] px-1.5 py-0.5 text-[7px] font-semibold uppercase tracking-[0.08em] text-white/55"
        >
          {tool}
        </span>
      ))}
    </div>
  );
}

export function WorkPhonePreview({ progress = 0 }: { progress?: number }) {
  const p = Math.min(1, Math.max(0, progress));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const float = 48_200 + tick * 2.1 + p * 80;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col justify-center px-2 py-1 font-[family-name:var(--font-inter)]">
      <p className="mb-0.5 text-center text-[6px] font-semibold uppercase tracking-[0.14em] text-white/35">
        Customers
      </p>
      <div className="space-y-0.5">
        {CUSTOMERS_TOP.map((c) => (
          <div
            key={c.name}
            className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1"
          >
            <p className="truncate text-[9px] font-semibold text-white/85">
              {c.name}
            </p>
            <p className="text-[8px] font-medium tabular text-white/45">
              {c.amount}
            </p>
          </div>
        ))}
      </div>

      <Stem />
      <ToolRow tools={TOOLS_IN} />
      <Stem />

      <div className="grid grid-cols-2 gap-1.5">
        {ORGS.map((org) => (
          <div
            key={org.name}
            className={`rounded-xl border px-2 py-1.5 ${
              org.primary
                ? "border-white/15 bg-white/[0.08]"
                : "border-white/8 bg-white/[0.03]"
            }`}
          >
            <p className="text-[6px] font-semibold uppercase tracking-[0.12em] text-white/35">
              {org.primary ? "Organization" : "Partner org"}
            </p>
            <p
              className={`mt-0.5 truncate text-[10px] font-semibold tracking-tight ${
                org.primary ? "text-white" : "text-white/55"
              }`}
            >
              {org.name}
            </p>
            {org.primary && (
              <p className="mt-0.5 text-[8px] font-semibold tabular text-white/80">
                {fmtUsd(float, 0)}
              </p>
            )}
          </div>
        ))}
      </div>

      <Stem />
      <ToolRow tools={TOOLS_PAY} />
      <Stem />

      <p className="mb-0.5 text-center text-[6px] font-semibold uppercase tracking-[0.14em] text-white/35">
        Professionals
      </p>
      <div className="space-y-0.5">
        {PROFESSIONALS.map((pro) => (
          <div
            key={pro.name}
            className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1"
          >
            <div className="min-w-0">
              <p className="truncate text-[9px] font-semibold text-white/85">
                {pro.name}
              </p>
              <p className="text-[7px] text-white/35">{pro.role}</p>
            </div>
            <p className="text-[8px] font-semibold tabular text-[#1d9e75]">
              +{fmtUsd(pro.rate, 2)}/s
            </p>
          </div>
        ))}
      </div>

      <Stem />
      <ToolRow tools={TOOLS_NEXT} />
      <Stem />

      <p className="mb-0.5 text-center text-[6px] font-semibold uppercase tracking-[0.14em] text-white/35">
        Their customers
      </p>
      <div className="space-y-0.5">
        {CUSTOMERS_NEXT.map((c) => (
          <div
            key={c.name}
            className="flex items-center justify-between rounded-lg border border-dashed border-white/12 bg-white/[0.03] px-2 py-1"
          >
            <div className="min-w-0">
              <p className="truncate text-[9px] font-semibold text-white/70">
                {c.name}
              </p>
              <p className="text-[7px] text-white/30">via {c.via}</p>
            </div>
            <p className="text-[8px] font-medium tabular text-white/40">
              {c.amount}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";

import { phoneFlowFooter } from "./phoneStyles";

export const btnPrimary =
  "w-full rounded-2xl bg-[#111] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white disabled:opacity-40";

export const btnSecondary =
  "w-full rounded-2xl border border-black/12 bg-white/80 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#111] backdrop-blur-sm";

type PhoneFlowShellProps = {
  step: number;
  totalSteps: number;
  title: string;
  children: ReactNode;
  footer: ReactNode;
};

export function PhoneFlowShell({
  step,
  totalSteps,
  title,
  children,
  footer,
}: PhoneFlowShellProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 px-1 pb-2 pt-1">
        <StepIndicator step={step} totalSteps={totalSteps} />
        <h2 className="mt-4 text-center text-[1.5rem] font-bold leading-tight tracking-tight text-[#111]">
          {title}
        </h2>
      </header>

      <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden">
        <div className="sl-scrollbar-hidden min-h-0 flex-1 overflow-y-auto px-1 pb-2">
          <div className="flex flex-col justify-end gap-4 pt-2">{children}</div>
        </div>
      </div>

      <footer className={phoneFlowFooter}>{footer}</footer>
    </div>
  );
}

function StepIndicator({
  step,
  totalSteps,
}: {
  step: number;
  totalSteps: number;
}) {
  const steps = Array.from({ length: totalSteps }, (_, i) => i + 1);
  const connectorW = totalSteps >= 4 ? "w-4" : "w-8";

  return (
    <div
      className="flex items-center justify-center gap-1.5"
      aria-label={`Step ${step} of ${totalSteps}`}
    >
      {steps.map((n) => (
        <div key={n} className="flex items-center gap-1.5">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold ${
              n === step
                ? "bg-[#111] text-white"
                : n < step
                  ? "bg-[#111]/15 text-[#111]"
                  : "bg-black/6 text-[#999]"
            }`}
          >
            {n}
          </span>
          {n < totalSteps && (
            <span
              className={`h-px ${connectorW} ${n < step ? "bg-[#111]/30" : "bg-black/10"}`}
              aria-hidden
            />
          )}
        </div>
      ))}
    </div>
  );
}

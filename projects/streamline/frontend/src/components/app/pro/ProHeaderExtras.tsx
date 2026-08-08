"use client";

import type { ReactNode } from "react";
import { requestProAction, type ProHeaderAction } from "./pro-actions";

const ACTIONS: {
  id: ProHeaderAction;
  label: string;
  icon: ReactNode;
}[] = [
  { id: "fund", label: "Fund", icon: <HeaderFundIcon /> },
  { id: "withdraw", label: "Withdraw", icon: <HeaderWithdrawIcon /> },
  { id: "invest", label: "Rebalance", icon: <HeaderRebalanceIcon /> },
];

export function ProActionButtons({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className={`flex flex-wrap items-center ${compact ? "gap-1" : "gap-1.5"}`}>
        {ACTIONS.map(({ id, label, icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => requestProAction(id)}
            className={`sl-glass-btn-dark inline-flex items-center gap-1 transition-colors ${
              id === "fund" ? "sl-glass-btn-dark-primary" : ""
            } ${compact ? "!px-2 !py-1 !text-[7px]" : "!px-3 !py-1.5 !text-[9px]"}`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function HeaderFundIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function HeaderWithdrawIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 5v10M8 11l4 4 4-4M5 19h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HeaderRebalanceIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h12M16 7l-2.5-2.5M16 7l-2.5 2.5M20 17H8M8 17l2.5-2.5M8 17l2.5 2.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Title used in AppChrome + phone shell. Kept name for import stability. */
export function ProTitleWithDemo({
  compact = false,
  title = "StreamLine",
}: {
  compact?: boolean;
  title?: string;
}) {
  return (
    <div className={`flex min-w-0 items-center ${compact ? "gap-1.5" : "gap-2"}`}>
      <span
        className={`truncate font-semibold tracking-tight text-white ${
          compact ? "text-sm" : "text-[14px] font-bold tracking-[-0.02em]"
        }`}
      >
        {title}
        <span className="font-medium text-white/40">.pro</span>
      </span>
    </div>
  );
}

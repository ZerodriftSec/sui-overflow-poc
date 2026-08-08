"use client";

import { useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";

import { WalletButton } from "@/components/wallet/WalletButton";
import { StreamCreator } from "../StreamCreator";
import { FreelancerDashboard } from "../FreelancerDashboard";
import { ClientDashboard } from "../ClientDashboard";
import { YieldPanel } from "../YieldPanel";
import { CollateralPanel } from "../CollateralPanel";
import { RoleSelect, type Role } from "./RoleSelect";
import { usePhoneEmbedded } from "../phone/PhoneEmbeddedContext";

// Privacy is a per-stream toggle in the Create flow (not a separate tab);
// private streams appear directly in each dashboard.
const PAYER_TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "create", label: "Create stream" },
  { id: "yield", label: "Yield" },
] as const;

const RECEIVER_TABS = [
  { id: "earn", label: "Dashboard" },
  { id: "yield", label: "Yield" },
  { id: "collateral", label: "Collateral" },
] as const;

export function UserAppShell() {
  const account = useCurrentAccount();
  const embedded = usePhoneEmbedded();
  const [role, setRole] = useState<Role | null>(null);
  const [tab, setTab] = useState<string>("create");

  const selectRole = (r: Role) => {
    setRole(r);
    setTab(r === "payer" ? "dashboard" : "earn");
  };

  const tabs = role === "payer" ? PAYER_TABS : RECEIVER_TABS;

  if (!account) {
    if (embedded) {
      return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-2 text-center">
          <p className="text-[10px] text-[#888]">Connect wallet above to continue</p>
        </div>
      );
    }

    return (
      <div className="flex min-h-[calc(100dvh-57px)] flex-col items-center justify-center gap-6 px-6 text-center">
        <p className="text-[11px] uppercase tracking-[0.24em] text-[#5b54e6]">
          StreamLine
        </p>
        <h1 className="max-w-2xl text-[clamp(24px,4vw,40px)] font-black leading-[0.95] tracking-[-0.03em]">
          Connect to create and watch streams.
        </h1>
        <WalletButton className="sl-glass-btn sl-glass-btn-primary !px-8 !py-3" />
      </div>
    );
  }

  if (!role) {
    return <RoleSelect onSelect={selectRole} />;
  }

  return (
    <div
      className={
        embedded
          ? "flex min-h-0 flex-1 flex-col"
          : "mx-auto max-w-[1100px] px-6 py-10"
      }
    >
      <button
        type="button"
        onClick={() => setRole(null)}
        className={
          embedded
            ? "mb-3 self-start text-[9px] font-medium uppercase tracking-[0.12em] text-[#2b2a5e]/55"
            : "mb-8 border border-[#2b2a5e]/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-[#2b2a5e]/60 hover:border-[#5b54e6]"
        }
      >
        ← change role
      </button>

      <nav
        className={
          embedded
            ? "mb-3 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]"
            : "mb-10 flex flex-wrap gap-2"
        }
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 transition-colors ${
              embedded
                ? "px-2.5 py-1.5 text-[9px] uppercase tracking-[0.08em]"
                : "px-4 py-2.5 text-[12px] uppercase tracking-[0.1em]"
            } ${
              tab === t.id
                ? "bg-[#2b2a5e] text-white"
                : "border border-[#2b2a5e]/20 text-[#2b2a5e]/70 hover:border-[#5b54e6]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className={embedded ? "min-h-0 flex-1 overflow-y-auto pr-0.5" : ""}>
        {tab === "create" && <StreamCreator />}
        {tab === "dashboard" && <ClientDashboard />}
        {tab === "earn" && <FreelancerDashboard />}
        {tab === "yield" && <YieldPanel />}
        {tab === "collateral" && <CollateralPanel />}
      </div>
    </div>
  );
}

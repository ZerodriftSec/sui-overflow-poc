"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useCurrentAccount, useSuiClientQuery } from "@mysten/dapp-kit";

import { useNetworkVariable } from "@/lib/networks";
import { USDC_BASE } from "@/lib/stream-math";
import { shortAddress } from "@/lib/format";
import { useProWorkspace } from "./ProWorkspaceContext";
import { onProAction } from "./pro-actions";
import {
  YIELD_APY,
  bucketLabel,
  buildMonthlyRun,
  fmtUsd,
  groupCommitted,
  monthlyToPerSec,
  averageCoverPct,
} from "./types";
import {
  OnramperModal,
  onramperConfigured,
  type OnrampMode,
} from "@/components/wallet/OnramperWidget";
import { ProActionModals } from "./modals/ProActionModals";
import { RosterUnlockBanner } from "./RosterUnlockBanner";
import { MonthlyRunBars, StatusPill } from "./ui";
import { HideBalanceCard } from "@/components/app/HideBalanceCard";
import { ReportsScreen } from "./screens/ReportsScreen";
import { ToolsScreen } from "./screens/ToolsScreen";
import { StreamActions } from "./screens/StreamsScreen";

type PhoneTab = "overview" | "streams" | "people" | "treasury" | "tools" | "reports";

export function PhoneProWorkspace() {
  const [tab, setTab] = useState<PhoneTab>("overview");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [rampMode, setRampMode] = useState<OnrampMode | null>(null);

  useEffect(() => {
    return onProAction((action) => {
      if (action === "compliance") setTab("reports");
    });
  }, []);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col font-[family-name:var(--font-inter)]">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-16 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tab === "overview" && (
          <OverviewTab
            expanded={expanded}
            onToggle={(id) =>
              setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
            }
          />
        )}
        {tab === "streams" && <StreamsTab />}
        {tab === "people" && <PeopleTab />}
        {tab === "treasury" && <TreasuryTab onRamp={setRampMode} />}
        {tab === "tools" && <ToolsScreen />}
        {tab === "reports" && (
          <ReportsTab onBack={() => setTab("overview")} />
        )}
      </div>

      <ProPhoneDock tab={tab} onTab={setTab} />

      <ProActionModals />
      <OnramperModal
        open={rampMode !== null}
        mode={rampMode ?? "buy"}
        onClose={() => setRampMode(null)}
        contained
      />
    </div>
  );
}

/** Floating mobile dock: Overview · Treasury · Streams · People · Tools */
function ProPhoneDock({
  tab,
  onTab,
}: {
  tab: PhoneTab;
  onTab: (t: PhoneTab) => void;
}) {
  const items: { id: PhoneTab; label: string; icon: ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <IconOverview /> },
    { id: "treasury", label: "Treasury", icon: <IconTreasury /> },
    { id: "streams", label: "Streams", icon: <IconStreams /> },
    { id: "people", label: "People", icon: <IconPeople /> },
    { id: "tools", label: "Tools", icon: <IconTools /> },
  ];

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-1.5 pb-1 pt-8"
      data-demo="pro-home"
    >
      <div
        className="pointer-events-none absolute inset-x-3 bottom-0 h-12 rounded-[1.75rem] bg-black/70 blur-2xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent"
        aria-hidden
      />
      <div className="pointer-events-auto relative flex items-center justify-around rounded-[1.75rem] border border-white/[0.14] bg-white/[0.08] px-1.5 py-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.65),0_4px_16px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        {items.map((item) => (
          <DockTab
            key={item.id}
            active={tab === item.id}
            label={item.label}
            icon={item.icon}
            demoAction={`pro-tab-${item.id}`}
            onClick={() => onTab(item.id)}
          />
        ))}
      </div>
    </div>
  );
}

function DockTab({
  active,
  label,
  icon,
  onClick,
  demoAction,
}: {
  active: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  demoAction?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-demo-action={demoAction}
      className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1 transition-colors ${
        active ? "text-white" : "text-white/35 active:text-white/70"
      }`}
    >
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full ${
          active ? "bg-white/12 text-white" : "text-inherit"
        }`}
      >
        {icon}
      </span>
      <span
        className={`text-[6.5px] font-semibold uppercase tracking-[0.1em] ${
          active ? "text-white/85" : "text-inherit"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

function IconTools() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17l3 3 5.1-5.1a4 4 0 0 0 5.6-5.6l-2.5 2.5-2.5-2.5 2.5-2.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconOverview() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function IconStreams() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h11M4 12h16M4 17h9"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="18" cy="7" r="1.6" fill="currentColor" />
      <circle cx="15" cy="17" r="1.6" fill="currentColor" />
    </svg>
  );
}

function IconPeople() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M3.5 19c.6-3 2.8-4.5 5.5-4.5S14 16 14.5 19"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="17" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M16 14.5c1.8.2 3.2 1.2 3.8 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconTreasury() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 19V11M12 19V5M19 19v-7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function OverviewTab({
  expanded,
  onToggle,
}: {
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  const { workspace, totals, setModal } = useProWorkspace();
  const ungrouped = workspace.workers.filter((w) => !w.groupId);
  const alloc = workspace.pool.allocation;
  const poolTotal = alloc.idle + alloc.yield_vault + alloc.reserve || 1;

  const periodLabel = new Date()
    .toLocaleDateString(undefined, { month: "short", year: "2-digit" })
    .toUpperCase();

  const months = useMemo(
    () =>
      buildMonthlyRun(
        totals.monthly,
        alloc.yield_vault,
        totals.yieldEarned,
        9
      ),
    [totals.monthly, alloc.yield_vault, totals.yieldEarned]
  );

  const currentCover = averageCoverPct(months);
  const currentMonth = months.find((m) => m.isCurrent);
  const yieldThisMonth = currentMonth?.yieldUsd ?? 0;

  const donut = useMemo(() => {
    const segs = [
      { key: "idle", value: alloc.idle, stroke: "rgba(255,255,255,0.78)" },
      { key: "yield", value: alloc.yield_vault, stroke: "#22c55e" },
      { key: "reserve", value: alloc.reserve, stroke: "rgba(255,255,255,0.28)" },
    ];
    let offset = 0;
    return segs.map((seg) => {
      const pct = (seg.value / poolTotal) * 100;
      const item = { ...seg, dash: `${pct} ${100 - pct}`, offset: -offset };
      offset += pct;
      return item;
    });
  }, [alloc, poolTotal]);

  const recentWorkers = useMemo(
    () =>
      [...workspace.workers]
        .sort((a, b) => b.monthlyUsd - a.monthlyUsd)
        .slice(0, 5),
    [workspace.workers]
  );

  return (
    <div className="flex flex-col gap-2.5 px-0.5 pb-1 pt-0.5">
      {/* Pool balance */}
      <div className="px-0.5">
        <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-white/35">
          Pool balance
        </p>
        <p className="mt-1 text-[1.85rem] font-semibold tabular leading-none tracking-tight text-white">
          {fmtUsd(totals.displayTotal, totals.displayTotal % 1 ? 2 : 0)}
        </p>
        <p className="mt-1.5 text-[9px] text-white/35">
          Manage funds on Treasury
        </p>
      </div>

      {/* Finance hero — striped run chart */}
      <section className="sl-pro-card sl-pro-card--flush p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] text-white/45">Payroll overview</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <p className="max-w-[5.5rem] text-right text-[8px] leading-snug text-white/40">
              yield covering payroll
            </p>
            <p className="text-[1.15rem] font-semibold tabular leading-none text-[#22c55e]">
              +{currentCover.toFixed(1)}%
            </p>
          </div>
        </div>

        <div className="mt-3">
          <MonthlyRunBars points={months} size="sm" showAmounts />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <div className="rounded-[1.1rem] bg-[#22c55e]/[0.12] px-2.5 py-2.5">
            <p className="text-[7px] font-semibold uppercase tracking-[0.14em] text-[#22c55e]/75">
              Yield / mo
            </p>
            <p className="mt-1 text-[12px] font-semibold tabular leading-none text-[#22c55e]">
              +{fmtUsd(yieldThisMonth, 0)}
            </p>
          </div>
          <div className="rounded-[1.1rem] bg-white/[0.045] px-2.5 py-2.5">
            <p className="text-[7px] font-semibold uppercase tracking-[0.14em] text-white/40">
              Payroll / mo
            </p>
            <p className="mt-1 text-[12px] font-semibold tabular leading-none text-white/85">
              −{fmtUsd(totals.monthly, 0)}
            </p>
          </div>
        </div>
      </section>

      {/* Payroll twin stats */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setModal("invest")}
          className="sl-pro-card sl-pro-card--flush p-3 text-left transition-transform active:scale-[0.99]"
        >
          <div className="flex items-center gap-1.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#22c55e]/15 text-[#22c55e]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M4 7h11M4 12h16M4 17h9"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="text-[10px] font-medium text-white/55">Streaming</span>
            <span className="ml-auto text-[10px] tabular text-white/35">
              {totals.active} ›
            </span>
          </div>
          <p className="mt-2.5 text-[1.05rem] font-semibold tabular tracking-tight text-white">
            {fmtUsd(totals.monthly, 0)}
          </p>
          <p className="mt-0.5 text-[8px] text-white/35">/mo committed</p>
        </button>

        <div className="sl-pro-card sl-pro-card--flush p-3">
          <div className="flex items-center gap-1.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/8 text-white/70">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect
                  x="4"
                  y="5"
                  width="16"
                  height="14"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="M8 9h8M8 13h5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="text-[10px] font-medium text-white/55">Claimable</span>
            <span className="ml-auto text-[10px] tabular text-white/35">
              {workspace.workers.length} ›
            </span>
          </div>
          <p className="mt-2.5 text-[1.05rem] font-semibold tabular tracking-tight text-white">
            {fmtUsd(totals.claimable)}
          </p>
          <p className="mt-0.5 text-[8px] text-white/35">open across roster</p>
        </div>
      </div>

      {/* Finance pool holdings + donut */}
      <section className="sl-pro-card sl-pro-card--flush p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[12px] font-medium text-white/90">Pool holdings</p>
            <p className="mt-0.5 text-[9px] text-white/35">
              {fmtUsd(totals.poolBalance)} total
            </p>
          </div>
          <button
            type="button"
            aria-label="Rebalance"
            onClick={() => setModal("invest")}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#22c55e] text-white shadow-[0_6px_18px_rgba(34,197,94,0.35)] transition-transform active:scale-95"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M7 17L17 7M17 7H9M17 7v8"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <div className="mt-2 flex items-center gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            {(
              [
                {
                  key: "idle",
                  label: bucketLabel("idle"),
                  value: alloc.idle,
                  color: "bg-white/75",
                },
                {
                  key: "yield",
                  label: bucketLabel("yield_vault"),
                  value: alloc.yield_vault,
                  color: "bg-[#22c55e]",
                },
                {
                  key: "reserve",
                  label: bucketLabel("reserve"),
                  value: alloc.reserve,
                  color: "bg-white/30",
                },
              ] as const
            ).map((seg) => (
              <div key={seg.key} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-[9px] text-white/50">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${seg.color}`} />
                  <span className="truncate">{seg.label}</span>
                </span>
                <span className="shrink-0 tabular text-[9px] text-white/75">
                  {fmtUsd(seg.value, 0)}
                </span>
              </div>
            ))}
          </div>

          <div className="sl-pro-donut-wrap">
            <svg viewBox="0 0 140 84" aria-hidden>
              <path
                d="M16 78 A54 54 0 0 1 124 78"
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="14"
                strokeLinecap="round"
                pathLength={100}
              />
              {donut.map((seg) => (
                <path
                  key={seg.key}
                  d="M16 78 A54 54 0 0 1 124 78"
                  fill="none"
                  stroke={seg.stroke}
                  strokeWidth="14"
                  strokeLinecap="butt"
                  pathLength={100}
                  strokeDasharray={seg.dash}
                  strokeDashoffset={seg.offset}
                />
              ))}
            </svg>
            <div className="sl-pro-donut-center">
              <p className="text-[7px] uppercase tracking-[0.14em] text-white/35">
                Total
              </p>
              <p className="mt-0.5 text-[12px] font-semibold tabular leading-none text-white">
                {compactUsd(totals.poolBalance)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Payroll payment cards */}
      <div>
        <div className="mb-2 flex items-center justify-between px-0.5">
          <p className="text-[13px] font-semibold text-white">Recent streams</p>
          <span className="text-[9px] text-white/35">
            {workspace.groups.length} groups
          </span>
        </div>

        <div className="space-y-2">
          {workspace.groups.map((group) => {
            const members = workspace.workers.filter((w) => w.groupId === group.id);
            const dripping = members.filter((w) => w.status === "dripping");
            const committed = groupCommitted(workspace, group.id);
            const isOpen = !!expanded[group.id];
            const lead = members[0];
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => onToggle(group.id)}
                className="sl-pro-card sl-pro-card--flush w-full p-3 text-left transition-transform active:scale-[0.99]"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/8 text-[11px] font-semibold text-white/80 ring-1 ring-white/10">
                    {group.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-white">
                      {group.name}
                    </p>
                    <p className="truncate text-[9px] text-white/40">
                      {members.length} people · {dripping.length} streaming
                      {lead ? ` · ${lead.alias}` : ""}
                    </p>
                  </div>
                  <span className="text-[14px] text-white/25">{isOpen ? "‹" : "›"}</span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[7px] font-medium uppercase tracking-[0.14em] text-white/30">
                      Pay period
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-white/85">
                      {periodLabel}
                    </p>
                  </div>
                  <div>
                    <p className="text-[7px] font-medium uppercase tracking-[0.14em] text-white/30">
                      Rate
                    </p>
                    <p className="mt-1 text-[11px] font-semibold tabular text-white/85">
                      {fmtUsd(committed, 0)}
                      <span className="text-[8px] font-medium text-white/35">/mo</span>
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between rounded-[1rem] bg-black/35 px-3 py-2.5">
                  <p className="text-[8px] font-medium uppercase tracking-[0.14em] text-white/35">
                    Monthly total
                  </p>
                  <p className="text-[13px] font-semibold tabular text-white">
                    {fmtUsd(committed, 0)}
                  </p>
                </div>

                {isOpen && members.length > 0 ? (
                  <div className="mt-2.5 space-y-1.5 border-t border-white/[0.06] pt-2.5">
                    {members.map((w) => (
                      <div
                        key={w.id}
                        className="flex items-center justify-between gap-2 rounded-xl px-1 py-1"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/8 text-[8px] font-semibold text-white/70">
                            {w.alias.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[10px] font-medium text-white/80">
                              {w.alias}
                            </p>
                            <p className="text-[8px] text-white/30">
                              {fmtUsd(w.monthlyUsd, 0)}/mo
                            </p>
                          </div>
                        </div>
                        <StatusPill status={w.status} compact />
                      </div>
                    ))}
                  </div>
                ) : null}
              </button>
            );
          })}

          {recentWorkers
            .filter((w) => !w.groupId)
            .slice(0, 2)
            .map((w) => (
              <div key={w.id} className="sl-pro-card sl-pro-card--flush w-full p-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/8 text-[11px] font-semibold text-white/80 ring-1 ring-white/10">
                    {w.alias.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-white">
                      {w.alias}
                    </p>
                    <p className="truncate text-[9px] text-white/40">
                      {shortAddress(w.walletAddress)} · ungrouped
                    </p>
                  </div>
                  <StatusPill status={w.status} compact />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[7px] font-medium uppercase tracking-[0.14em] text-white/30">
                      Pay period
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-white/85">
                      {periodLabel}
                    </p>
                  </div>
                  <div>
                    <p className="text-[7px] font-medium uppercase tracking-[0.14em] text-white/30">
                      Rate
                    </p>
                    <p className="mt-1 text-[11px] font-semibold tabular text-white/85">
                      {fmtUsd(w.monthlyUsd, 0)}
                      <span className="text-[8px] font-medium text-white/35">/mo</span>
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between rounded-[1rem] bg-black/35 px-3 py-2.5">
                  <p className="text-[8px] font-medium uppercase tracking-[0.14em] text-white/35">
                    Monthly total
                  </p>
                  <p className="text-[13px] font-semibold tabular text-white">
                    {fmtUsd(w.monthlyUsd, 0)}
                  </p>
                </div>
              </div>
            ))}

          {workspace.groups.length === 0 && ungrouped.length === 0 ? (
            <div className="sl-pro-card sl-pro-card--flush px-3 py-8 text-center">
              <p className="text-[12px] text-white/40">
                No substreams yet — tap + to start a run.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function compactUsd(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return abs >= 10 ? n.toFixed(0) : n.toFixed(1);
}

function StreamsTab() {
  const {
    workspace,
    setModal,
    setWorkerStatus,
    createWorkerStream,
    settleVested,
    approveStream,
    cancelStream,
    creating,
    deleteWorker,
  } = useProWorkspace();

  const active = workspace.workers.filter((w) => w.status === "dripping");
  const paused = workspace.workers.filter((w) => w.status === "paused");
  const activeMonthly = active.reduce((s, w) => s + w.monthlyUsd, 0);
  const activeFlow = active.reduce(
    (s, w) => s + monthlyToPerSec(w.monthlyUsd),
    0
  );

  return (
    <div className="flex flex-col px-0.5 pb-1 pt-0.5">
      <div className="mb-2">
        <RosterUnlockBanner />
      </div>
      <p className="text-[8px] font-medium uppercase tracking-[0.18em] text-white/40">
        Live substreams
      </p>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <div className="sl-pro-card sl-pro-card--flush px-2 py-2.5 text-center">
          <p className="text-[7px] font-semibold uppercase tracking-[0.12em] text-white/40">
            Active
          </p>
          <p className="mt-1 text-[14px] font-semibold tabular text-white">
            {active.length}
          </p>
          <p className="mt-0.5 text-[8px] tabular text-white/35">
            {fmtUsd(activeMonthly, 0)}/mo
          </p>
        </div>
        <div className="sl-pro-card sl-pro-card--flush px-2 py-2.5 text-center">
          <p className="text-[7px] font-semibold uppercase tracking-[0.12em] text-white/40">
            Flow
          </p>
          <p className="mt-1 text-[14px] font-semibold tabular text-white">
            −{fmtUsd(activeFlow, 4)}
          </p>
          <p className="mt-0.5 text-[8px] text-white/35">/s live</p>
        </div>
        <div className="sl-pro-card sl-pro-card--flush px-2 py-2.5 text-center">
          <p className="text-[7px] font-semibold uppercase tracking-[0.12em] text-white/40">
            Roster
          </p>
          <p className="mt-1 text-[14px] font-semibold tabular text-white">
            {workspace.workers.length}
          </p>
          <p className="mt-0.5 text-[8px] text-white/35">
            {paused.length} paused
          </p>
        </div>
      </div>

      <div className="mt-2.5 space-y-1.5">
        <button
          type="button"
          onClick={() => setModal("worker")}
          data-demo-action="pro-add-stream"
          className="sl-pro-card sl-pro-card--flush flex w-full items-center gap-2.5 px-2.5 py-2.5 text-left transition-colors active:bg-white/[0.04]"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-white/25 text-[16px] text-white/45">
            +
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-white/85">
              Add new stream
            </p>
            <p className="text-[8px] text-white/35">Hire onto the payroll pool</p>
          </div>
        </button>

        {workspace.workers.map((w) => {
          const group = workspace.groups.find((g) => g.id === w.groupId);
          const drip = monthlyToPerSec(w.monthlyUsd);
          return (
            <div
              key={w.id}
              className="sl-pro-card sl-pro-card--flush px-2.5 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-[11px] font-medium text-white/85">
                    {w.alias}
                  </p>
                  <p className="text-[8px] text-white/35">
                    {group?.name ?? "Ungrouped"} ·{" "}
                    {w.shieldedAddress
                      ? `${w.shieldedAddress.slice(0, 8)}…`
                      : shortAddress(w.walletAddress)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[11px] font-semibold tabular text-white/80">
                    {fmtUsd(w.monthlyUsd, 0)}
                    <span className="text-[8px] font-normal text-white/35">
                      /mo
                    </span>
                  </p>
                  <p className="text-[8px] tabular text-white/40">
                    {w.status === "dripping" ? `−${fmtUsd(drip, 4)}/s` : "—"}
                  </p>
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <StatusPill status={w.status} compact />
                <span className="flex-1" />
                <StreamActions
                  worker={w}
                  creating={creating}
                  onStatus={setWorkerStatus}
                  onStart={createWorkerStream}
                  onSettle={settleVested}
                  onApprove={approveStream}
                  onCancel={(streamId, alias) => {
                    if (
                      window.confirm(
                        `Cancel ${alias}'s stream and refund the remainder to the pool?`
                      )
                    ) {
                      void cancelStream(streamId);
                    }
                  }}
                  onDelete={(id, alias) => {
                    const msg = w.engagementId
                      ? `Remove ${alias} from the roster? The locked funds stay in your Shielded vault — reclaim them via Tools → Private vault → Unshield.`
                      : `Remove ${alias} from the run?`;
                    if (window.confirm(msg)) {
                      deleteWorker(id);
                    }
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PeopleTab() {
  const { workspace, setModal, createWorkerStream, creating } =
    useProWorkspace();
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [status, setStatus] = useState<
    "all" | "dripping" | "paused" | "pending" | "stopped"
  >("all");

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: workspace.workers.length };
    for (const id of ["dripping", "paused", "pending", "stopped"] as const) {
      counts[id] = workspace.workers.filter((w) => w.status === id).length;
    }
    return counts;
  }, [workspace.workers]);

  const statusFilters = [
    { id: "all" as const, label: "All" },
    { id: "dripping" as const, label: "Live" },
    { id: "paused" as const, label: "Paused" },
    { id: "pending" as const, label: "Pending" },
    { id: "stopped" as const, label: "Stopped" },
  ];

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...workspace.workers]
      .sort((a, b) => a.alias.localeCompare(b.alias))
      .filter((w) => {
        if (status !== "all" && w.status !== status) return false;
        if (groupFilter !== "all" && w.groupId !== groupFilter) return false;
        if (!q) return true;
        return (
          w.alias.toLowerCase().includes(q) ||
          w.walletAddress.toLowerCase().includes(q)
        );
      });
  }, [workspace.workers, query, groupFilter, status]);

  const deptChipCh = Math.max(
    8,
    "Add group".length,
    ...workspace.groups.map((g) => g.name.length)
  ) + 1;

  return (
    <div className="flex flex-col gap-2.5 px-0.5 pb-1 pt-0.5">
      <RosterUnlockBanner />
      <div className="px-0.5">
        <p className="text-[13px] font-semibold text-white">People</p>
      </div>

      <label className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-[#1a1a1a] px-3 py-2.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="11" cy="11" r="6.5" stroke="rgba(255,255,255,0.35)" strokeWidth="1.7" />
          <path
            d="M16.5 16.5L20 20"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search roster"
          className="w-full bg-transparent text-[12px] text-white outline-none placeholder:text-white/30"
        />
      </label>

      <div>
        <p className="mb-1.5 px-0.5 text-[8px] font-medium uppercase tracking-[0.14em] text-white/35">
          Departments
        </p>
        <div className="flex flex-wrap gap-1.5">
          {workspace.groups.map((g) => {
            const n = workspace.workers.filter((w) => w.groupId === g.id).length;
            const selected = groupFilter === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() =>
                  setGroupFilter((prev) => (prev === g.id ? "all" : g.id))
                }
                style={{ width: `${deptChipCh}ch` }}
                className={`shrink-0 rounded-xl border px-2 py-2 text-left ${
                  selected
                    ? "border-white/30 bg-white/[0.1]"
                    : "border-white/10 bg-white/[0.04]"
                }`}
              >
                <p className="truncate text-[9px] font-semibold text-white">
                  {g.name}
                </p>
                <p className="mt-0.5 text-[8px] tabular text-white/40">{n}</p>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setModal("group")}
            style={{ width: `${deptChipCh}ch` }}
            className="shrink-0 rounded-xl border border-dashed border-white/15 px-2 py-2 text-left text-white/40"
          >
            <p className="truncate text-[9px] font-semibold">+ Add group</p>
            <p className="mt-0.5 text-[8px] text-white/25">New</p>
          </button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {statusFilters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setStatus(f.id)}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-medium ${
              status === f.id
                ? "bg-white text-[#0a0a0a]"
                : "border border-white/10 text-white/50"
            }`}
          >
            {f.label}
            <span
              className={`tabular ${
                status === f.id ? "text-[#0a0a0a]/50" : "text-white/30"
              }`}
            >
              {statusCounts[f.id] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="sl-pro-card sl-pro-card--flush divide-y divide-white/[0.05] overflow-hidden p-0">
        <button
          type="button"
          onClick={() => setModal("worker")}
          data-demo-action="pro-add-person"
          className="flex w-full items-center gap-2.5 px-3 py-3 text-left transition-colors active:bg-white/[0.04]"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-white/25 text-[16px] text-white/45">
            +
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-white/85">Add person</p>
            <p className="text-[9px] text-white/35">Private payroll by default</p>
          </div>
        </button>

        {rows.map((w) => {
          const group = workspace.groups.find((g) => g.id === w.groupId);
          return (
            <div
              key={w.id}
              className="flex w-full items-center gap-2.5 px-3 py-2.5"
            >
              <button
                type="button"
                onClick={() => setModal({ kind: "worker-edit", workerId: w.id })}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left transition-opacity active:opacity-70"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/8 text-[11px] font-semibold text-white/80 ring-1 ring-white/10">
                  {w.alias.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-[12px] font-semibold text-white">
                    {w.alias}
                  </p>
                  <p className="truncate text-[9px] text-white/40">
                    {group?.name ?? "Ungrouped"} · {fmtUsd(w.monthlyUsd, 0)}/mo
                  </p>
                </div>
              </button>
              {w.status === "pending" ? (
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => void createWorkerStream(w.id)}
                  className="inline-flex h-7 shrink-0 items-center rounded-full bg-white px-3 text-[10px] font-semibold text-[#0a0a0a] transition-opacity disabled:opacity-40"
                >
                  {creating ? "Starting…" : "Start"}
                </button>
              ) : (
                <StatusPill status={w.status} compact />
              )}
            </div>
          );
        })}
        {rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-[11px] text-white/35">
            No people match.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ReportsTab({ onBack }: { onBack: () => void }) {
  return <ReportsScreen onBack={onBack} />;
}

function TreasuryTab({ onRamp }: { onRamp: (mode: OnrampMode) => void }) {
  const { workspace, totals, setModal } = useProWorkspace();
  const account = useCurrentAccount();
  const alloc = workspace.pool.allocation;
  const total = alloc.idle + alloc.yield_vault + alloc.reserve || 1;
  const canRamp = onramperConfigured && !!account;
  const segments = [
    {
      key: "idle",
      label: bucketLabel("idle"),
      value: alloc.idle,
      color: "bg-white/75",
      stripe: true,
    },
    {
      key: "yield",
      label: bucketLabel("yield_vault"),
      value: alloc.yield_vault,
      color: "bg-[#1d9e75]",
      stripe: false,
    },
    {
      key: "reserve",
      label: bucketLabel("reserve"),
      value: alloc.reserve,
      color: "bg-white/35",
      stripe: true,
    },
  ];

  return (
    <div className="flex flex-col gap-2.5 px-0.5 pb-1 pt-0.5">
      <section className="sl-pro-card sl-pro-card--flush p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[8px] font-medium uppercase tracking-[0.16em] text-white/40">
              Treasury
            </p>
            <p className="mt-1.5 text-[1.45rem] font-semibold tabular leading-none text-white">
              {fmtUsd(totals.poolBalance)}
            </p>
          </div>
          <span className="sl-pro-chip !px-2 !py-1 !text-[8px]">Pool</span>
        </div>
        <p className="mt-1.5 text-[9px] tabular text-[#1d9e75]">
          +{fmtUsd(totals.yieldEarned, 4)} accrued
          {alloc.yield_vault > 0 && (
            <span className="text-[#1d9e75]/60">
              {" · +"}
              {fmtUsd(alloc.yield_vault * (YIELD_APY / 365 / 24 / 3600), 6)}/s
            </span>
          )}
        </p>

        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-white/[0.04] p-0.5">
          {segments.map((seg) => (
            <div
              key={seg.key}
              className={`relative h-full overflow-hidden rounded-full ${seg.color}`}
              style={{ width: `${(seg.value / total) * 100}%` }}
            >
              {seg.stripe ? (
                <span
                  className="pointer-events-none absolute inset-0 sl-pro-stripe-light opacity-70"
                  aria-hidden
                />
              ) : null}
            </div>
          ))}
        </div>
        <div className="mt-2.5 space-y-1">
          {segments.map((seg) => (
            <div
              key={seg.key}
              className="flex items-center justify-between rounded-xl bg-white/[0.04] px-2.5 py-2 text-[10px]"
            >
              <span className="flex items-center gap-1.5 text-white/45">
                <span className={`h-1.5 w-1.5 rounded-full ${seg.color}`} />
                {seg.label}
              </span>
              <span className="tabular text-white/80">{fmtUsd(seg.value, 0)}</span>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[9px] leading-snug text-white/35">
          Floor {fmtUsd(totals.floor, 0)} stays liquid · investable{" "}
          {fmtUsd(totals.investable, 0)}
        </p>

        <WalletBalanceRow />
      </section>

      <section className="relative">
        <div
          className="pointer-events-none absolute inset-x-1.5 inset-y-0.5 rounded-[1.4rem] bg-black/45 blur-xl"
          aria-hidden
        />
        <div className="relative rounded-[1.4rem] border border-white/[0.1] bg-transparent p-3.5 shadow-[0_12px_36px_rgba(0,0,0,0.55),0_2px_10px_rgba(0,0,0,0.35)]">
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              data-demo-action="pro-fund"
              onClick={() => setModal("fund")}
              className="flex flex-col items-center gap-1 rounded-2xl bg-[#22c55e] px-2 py-3 text-[11px] font-semibold tracking-tight text-white shadow-[0_8px_24px_rgba(34,197,94,0.28)] transition-transform active:scale-[0.98]"
            >
              <PhoneFundIcon />
              Fund
            </button>
            <button
              type="button"
              onClick={() => setModal("withdraw")}
              className="flex flex-col items-center gap-1 rounded-2xl border border-white/12 bg-white/[0.06] px-2 py-3 text-[11px] font-semibold tracking-tight text-white transition-colors active:bg-white/[0.1]"
            >
              <PhoneWithdrawIcon />
              Withdraw
            </button>
            <button
              type="button"
              data-demo-action="pro-rebalance"
              onClick={() => setModal("invest")}
              className="flex flex-col items-center gap-1 rounded-2xl border border-white/12 bg-white/[0.06] px-2 py-3 text-[11px] font-semibold tracking-tight text-white transition-colors active:bg-white/[0.1]"
            >
              <PhoneRebalanceIcon />
              Rebalance
            </button>
          </div>
          {canRamp ? (
            <div className="mt-2 border-t border-white/[0.06] pt-2">
              <p className="mb-1.5 px-0.5 text-[8px] font-medium uppercase tracking-[0.14em] text-white/25">
                Fiat on/off-ramp · card or bank
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onRamp("buy")}
                  className="rounded-xl border border-white/[0.08] bg-transparent px-2 py-2 text-[10px] font-medium text-white/50 transition-colors active:text-white/80"
                >
                  Buy USDC
                </button>
                <button
                  type="button"
                  onClick={() => onRamp("sell")}
                  className="rounded-xl border border-white/[0.08] bg-transparent px-2 py-2 text-[10px] font-medium text-white/50 transition-colors active:text-white/80"
                >
                  Sell USDC
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <HideBalanceCard variant="dark" />
    </div>
  );
}

function PhoneFundIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PhoneWithdrawIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 5v10M8 11l4 4 4-4M5 19h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PhoneRebalanceIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h12M16 7l-2.5-2.5M16 7l-2.5 2.5M20 17H8M8 17l2.5-2.5M8 17l2.5 2.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Connected wallet's spendable USDC — the balance you fund the pool from. */
function WalletBalanceRow() {
  const account = useCurrentAccount();
  const usdcType = useNetworkVariable("usdcType");
  const { data } = useSuiClientQuery(
    "getBalance",
    { owner: account?.address ?? "", coinType: usdcType },
    { enabled: !!account, refetchInterval: 15000 }
  );
  if (!account) return null;
  const bal = data ? Number(BigInt(data.totalBalance)) / USDC_BASE : 0;
  return (
    <div className="mt-2 flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5">
      <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] text-white/40">
        <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
        In your wallet
      </span>
      <span className="tabular text-[11px] font-semibold text-white">
        {fmtUsd(bal, 2)}
      </span>
    </div>
  );
}

function MiniBtn({
  children,
  onClick,
  accent,
  danger,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  accent?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`rounded-full px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wider disabled:opacity-30 ${
        danger
          ? "border border-[#c0533a]/35 text-[#c0533a]"
          : accent
            ? "border border-[#1d9e75]/35 bg-[#1d9e75]/10 text-[#1d9e75]"
            : "border border-white/12 text-white/55"
      }`}
    >
      {children}
    </button>
  );
}

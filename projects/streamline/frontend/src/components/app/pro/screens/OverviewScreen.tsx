"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";

import { usePhoneEmbedded } from "@/components/app/phone/PhoneEmbeddedContext";
import { shortAddress } from "@/lib/format";
import { useProWorkspace } from "../ProWorkspaceContext";
import {
  YIELD_APY,
  bucketLabel,
  buildMonthlyRun,
  fmtUsd,
  groupCommitted,
  averageCoverPct,
  workerClaimable,
} from "../types";
import {
  CompositionBar,
  MonthlyRunBars,
  ProCard,
  ProChip,
  ProEyebrow,
  ProIconButton,
  ProStat,
  StatusPill,
} from "../ui";

function SoftLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const embedded = usePhoneEmbedded();
  if (embedded) {
    return <span className={className}>{children}</span>;
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export function OverviewScreen() {
  const embedded = usePhoneEmbedded();
  const { workspace, totals, nowMs, setModal } = useProWorkspace();
  const alloc = workspace.pool.allocation;
  const recent = workspace.activity.slice(0, 6);
  const topWorkers = [...workspace.workers]
    .sort((a, b) => b.monthlyUsd - a.monthlyUsd)
    .slice(0, 5);

  const monthCount = 9;
  const months = useMemo(
    () =>
      buildMonthlyRun(
        totals.monthly,
        alloc.yield_vault,
        totals.yieldEarned,
        monthCount
      ),
    [totals.monthly, alloc.yield_vault, totals.yieldEarned, monthCount]
  );

  const coverPct = averageCoverPct(months);
  const yieldThisMonth =
    months.find((m) => m.isCurrent)?.yieldUsd ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <ProEyebrow>Overview</ProEyebrow>
          <h1
            className={`mt-2 font-semibold tracking-tight text-white ${
              embedded
                ? "text-[1.35rem]"
                : "text-[clamp(28px,4vw,40px)]"
            }`}
          >
            {workspace.orgName}
          </h1>
          {!embedded ? (
            <p className="mt-1 text-[13px] text-white/45">
              Shared USDC treasury · worker streams funded from the pool · idle
              capital can earn via the native yield adapter
              while unclaimed
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`sl-glass-btn-dark ${
              embedded ? "!px-2.5 !py-1 !text-[9px]" : "!px-4 !py-2 !text-[11px]"
            }`}
            onClick={() => setModal("invest")}
          >
            Rebalance
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ProStat
          label="Pool balance"
          value={fmtUsd(totals.poolBalance)}
          hint={`+${fmtUsd(totals.yieldEarned)} yield accrued`}
          accent
        />
        <ProStat
          label="Monthly committed"
          value={fmtUsd(totals.monthly, 0)}
          hint={`${totals.active} streaming now`}
        />
        <ProStat
          label="Open claimable"
          value={fmtUsd(totals.claimable)}
          hint="Unclaimed accrued across roster"
        />
        <ProStat
          label="Investable idle"
          value={fmtUsd(totals.investable, 0)}
          hint={`Floor ${fmtUsd(totals.floor, 0)}`}
        />
      </div>

      <ProCard padding="lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <ProEyebrow>Payroll overview</ProEyebrow>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2.5">
              <p className="text-right text-[11px] leading-snug text-white/40">
                yield covering payroll
              </p>
              <p
                className={`font-semibold tabular tracking-tight text-[#22c55e] ${
                  embedded ? "text-[1.45rem]" : "text-[2rem]"
                }`}
              >
                +{coverPct.toFixed(1)}%
              </p>
            </div>
            <div className="rounded-2xl bg-[#22c55e]/[0.12] px-3.5 py-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#22c55e]/80">
                Yield / mo
              </p>
              <p className="mt-1 text-[14px] font-semibold tabular text-[#22c55e]">
                +{fmtUsd(yieldThisMonth, 0)}
              </p>
            </div>
            <div className="rounded-2xl bg-white/[0.04] px-3.5 py-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/40">
                Payroll / mo
              </p>
              <p className="mt-1 text-[14px] font-semibold tabular text-white/85">
                −{fmtUsd(totals.monthly, 0)}
              </p>
            </div>
            <ProIconButton
              label="Rebalance capital"
              onClick={() => setModal("invest")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M12 19V5M12 5l-5 5M12 5l5 5"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </ProIconButton>
          </div>
        </div>

        <div className="mt-6">
          <MonthlyRunBars
            points={months}
            size={embedded ? "sm" : "lg"}
            showAmounts={!embedded}
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-white/40">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
            Payroll cost
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
            Yield cover inside each month
          </span>
          <span className="text-white/30">
            {(YIELD_APY * 100).toFixed(0)}% APR on vault ·{" "}
            {fmtUsd(alloc.yield_vault, 0)} invested
          </span>
        </div>
      </ProCard>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <ProCard padding="lg">
          <div className="flex items-center justify-between gap-3">
            <ProEyebrow>Pool composition</ProEyebrow>
            <ProChip>Live</ProChip>
          </div>
          <p
            className={`mt-4 font-semibold tabular tracking-tight text-white ${
              embedded ? "text-[1.65rem]" : "text-[2rem]"
            }`}
          >
            {fmtUsd(alloc.idle + alloc.yield_vault + alloc.reserve)}
          </p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-[13px] font-medium tabular text-[#1d9e75]">
              +{fmtUsd(totals.yieldEarned)}
            </p>
            <p className="text-[12px] text-white/40">
              yield accrued · streamed {fmtUsd(workspace.pool.streamed)}
            </p>
          </div>
          <div className="mt-6">
            <CompositionBar
              segments={[
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
                },
                {
                  key: "reserve",
                  label: bucketLabel("reserve"),
                  value: alloc.reserve,
                  color: "bg-white/35",
                  stripe: true,
                },
              ]}
            />
          </div>
        </ProCard>

        <ProCard>
          <div className="flex items-center justify-between gap-3">
            <ProEyebrow>Stream groups</ProEyebrow>
            <ProChip>{workspace.groups.length} groups</ProChip>
          </div>
          <div className="mt-4 space-y-2.5">
            {workspace.groups.length === 0 ? (
              <p className="text-[13px] text-white/40">No groups yet.</p>
            ) : (
              workspace.groups.map((g) => {
                const count = workspace.workers.filter(
                  (w) => w.groupId === g.id
                ).length;
                return (
                  <div
                    key={g.id}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.03] px-3.5 py-3"
                  >
                    <div>
                      <p className="text-[13px] font-medium text-white">
                        {g.name}
                      </p>
                      <p className="text-[11px] text-white/40">
                        {count} substream{count === 1 ? "" : "s"}
                      </p>
                    </div>
                    <p className="text-[13px] tabular text-white/80">
                      {fmtUsd(groupCommitted(workspace, g.id), 0)}/mo
                    </p>
                  </div>
                );
              })
            )}
          </div>
          <SoftLink
            href="/app/pro/people"
            className="mt-4 inline-block text-[11px] text-white/40 hover:text-white"
          >
            Manage people →
          </SoftLink>
        </ProCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ProCard>
          <div className="flex items-center justify-between">
            <ProEyebrow>Top substreams</ProEyebrow>
            <SoftLink
              href="/app/pro/streams"
              className="text-[11px] text-white/40 hover:text-white"
            >
              Funding →
            </SoftLink>
          </div>
          <div className="mt-4 space-y-2.5">
            {topWorkers.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.03] px-3.5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-white">
                    {w.alias}
                  </p>
                  <p className="text-[11px] text-white/35">
                    {shortAddress(w.walletAddress)} · claimable{" "}
                    {fmtUsd(workerClaimable(w, nowMs))}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusPill status={w.status} />
                  <span className="text-[12px] tabular text-white/70">
                    {fmtUsd(w.monthlyUsd, 0)}/mo
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ProCard>

        <ProCard>
          <ProEyebrow>Recent activity</ProEyebrow>
          <div className="mt-4 space-y-2.5">
            {recent.length === 0 ? (
              <p className="text-[13px] text-white/40">No activity yet.</p>
            ) : (
              recent.map((a) => (
                <div
                  key={a.id}
                  className="flex items-start justify-between gap-3 rounded-2xl bg-white/[0.03] px-3.5 py-3"
                >
                  <div>
                    <p className="text-[13px] text-white/85">{a.label}</p>
                    <p className="text-[11px] text-white/35">
                      {new Date(a.at).toLocaleString()}
                    </p>
                  </div>
                  {a.amount != null ? (
                    <span className="shrink-0 text-[12px] tabular text-[#1d9e75]">
                      {fmtUsd(a.amount)}
                    </span>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </ProCard>
      </div>
    </div>
  );
}

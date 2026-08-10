"use client";

import type { ReactNode } from "react";
import { shortAddress } from "@/lib/format";
import { useProWorkspace } from "../ProWorkspaceContext";
import { RosterUnlockBanner } from "../RosterUnlockBanner";
import {
  bucketLabel,
  fmtUsd,
  monthlyToPerSec,
  type ProWorker,
  type ProWorkerStatus,
} from "../types";
import {
  CompositionBar,
  ProCard,
  ProEyebrow,
  ProStat,
  StatusPill,
} from "../ui";

function IconPause() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M7 5h3v14H7V5zm7 0h3v14h-3V5z" fill="currentColor" />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M8 5v14l11-7L8 5z" fill="currentColor" />
    </svg>
  );
}

function IconStop() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 7h14M9 7V5h6v2m-8 0v12a1 1 0 001 1h6a1 1 0 001-1V7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ActionIconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      data-demo-action={
        label === "Start" || label === "Restart" || label === "Resume"
          ? "pro-start"
          : undefined
      }
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors disabled:opacity-40 ${
        danger
          ? "border-[#c0533a]/35 text-[#c0533a] hover:bg-[#c0533a]/10"
          : "border-white/12 text-white/70 hover:bg-white/5 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

export function StreamActions({
  worker,
  creating,
  onStatus,
  onStart,
  onSettle,
  onApprove,
  onCancel,
  onDelete,
}: {
  worker: ProWorker;
  creating: boolean;
  onStatus: (id: string, status: ProWorkerStatus) => void;
  onStart: (id: string) => void;
  onSettle: (id: string) => void;
  onApprove: (streamId: string) => void;
  onCancel: (streamId: string, alias: string) => void;
  onDelete: (id: string, alias: string) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      {worker.engagementId ? (
        <button
          type="button"
          title="Pay the worker the amount vested so far (settle_vested)"
          disabled={creating}
          onClick={(e) => {
            e.stopPropagation();
            onSettle(worker.id);
          }}
          className="inline-flex h-7 items-center rounded-full bg-white px-2.5 text-[10px] font-semibold text-[#0a0a0a] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Pay vested
        </button>
      ) : null}
      {worker.status === "dripping" ? (
        <ActionIconBtn
          label="Pause"
          onClick={() => onStatus(worker.id, "paused")}
        >
          <IconPause />
        </ActionIconBtn>
      ) : null}
      {worker.status === "paused" ||
      worker.status === "pending" ||
      worker.status === "stopped" ? (
        <ActionIconBtn
          label={
            worker.status === "pending"
              ? "Start"
              : worker.status === "stopped"
                ? "Restart"
                : "Resume"
          }
          disabled={creating}
          onClick={() => {
            if (worker.streamId && worker.status === "pending")
              onApprove(worker.streamId); // approve review-ready stream on-chain
            else if (worker.streamId || worker.engagementId)
              onStatus(worker.id, "dripping"); // resume
            else onStart(worker.id); // open private engagement or treasury stream
          }}
        >
          <IconPlay />
        </ActionIconBtn>
      ) : null}
      {worker.status === "dripping" || worker.status === "paused" ? (
        <ActionIconBtn
          label="Stop"
          onClick={() => onStatus(worker.id, "stopped")}
        >
          <IconStop />
        </ActionIconBtn>
      ) : null}
      <ActionIconBtn
        label="Delete"
        danger
        onClick={() =>
          worker.status === "stopped" || worker.engagementId || !worker.streamId
            ? onDelete(worker.id, worker.alias)
            : onCancel(worker.streamId, worker.alias)
        }
      >
        <IconTrash />
      </ActionIconBtn>
    </div>
  );
}

export function StreamsScreen() {
  const {
    workspace,
    totals,
    setModal,
    setWorkerStatus,
    createWorkerStream,
    settleVested,
    approveStream,
    cancelStream,
    creating,
    deleteWorker,
  } = useProWorkspace();
  const alloc = workspace.pool.allocation;

  const cancelOnChain = (streamId: string, alias: string) => {
    if (window.confirm(`Cancel ${alias}'s stream and refund the remainder to the pool?`)) {
      void cancelStream(streamId);
    }
  };

  const active = workspace.workers.filter((w) => w.status === "dripping");
  const paused = workspace.workers.filter((w) => w.status === "paused");
  const stopped = workspace.workers.filter((w) => w.status === "stopped");
  const activeMonthly = active.reduce((s, w) => s + w.monthlyUsd, 0);
  const activeFlow = active.reduce(
    (s, w) => s + monthlyToPerSec(w.monthlyUsd),
    0
  );

  const removeWorker = (id: string, alias: string) => {
    const w = workspace.workers.find((x) => x.id === id);
    const msg = w?.engagementId
      ? `Remove ${alias} from the roster? The locked funds stay in your Shielded vault — reclaim them via Private vault → Unshield.`
      : `Remove ${alias} from the payroll run?`;
    if (window.confirm(msg)) {
      deleteWorker(id);
    }
  };

  return (
    <div className="space-y-6">
      <RosterUnlockBanner />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <ProEyebrow>Funding & streams</ProEyebrow>
          <h1 className="mt-2 text-[clamp(26px,3.5vw,36px)] font-semibold tracking-tight text-white">
            Run the payroll pool
          </h1>
          <p className="mt-1 max-w-xl text-[13px] text-white/45">
            Fund the pool, hire people onto the roster, and start streaming
            payroll. Pause, resume, and stop from here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="sl-glass-btn-dark !px-4 !py-2 !text-[11px]"
            onClick={() => setModal("withdraw")}
          >
            Withdraw
          </button>
          <button
            type="button"
            className="sl-glass-btn-dark !px-4 !py-2 !text-[11px]"
            onClick={() => setModal("invest")}
          >
            Rebalance
          </button>
          <button
            type="button"
            className="sl-glass-btn-dark !px-4 !py-2 !text-[11px]"
            onClick={() => setModal("fund")}
          >
            Fund & start
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ProStat
          align="center"
          label="Active streams"
          value={String(active.length)}
          hint={`${fmtUsd(activeMonthly, 0)}/mo · −${fmtUsd(activeFlow, 4)}/s`}
        />
        <ProStat
          align="center"
          label="Paused"
          value={String(paused.length)}
          hint={`${stopped.length} stopped · ${workspace.workers.length} total`}
        />
        <ProStat
          align="center"
          label="In pool"
          value={fmtUsd(totals.poolBalance)}
        />
        <ProStat
          align="center"
          label="Coverage floor"
          value={fmtUsd(totals.floor, 0)}
          hint={`${workspace.pool.coverageWeeks} weeks committed`}
        />
      </div>

      <ProCard>
        <ProEyebrow>Capital mix</ProEyebrow>
        <div className="mt-4">
          <CompositionBar
            segments={[
              {
                key: "idle",
                label: bucketLabel("idle"),
                value: alloc.idle,
                color: "bg-white/70",
                stripe: true,
              },
              {
                key: "yield",
                label: bucketLabel("yield_vault"),
                value: alloc.yield_vault,
                color: "bg-white/40",
              },
              {
                key: "reserve",
                label: bucketLabel("reserve"),
                value: alloc.reserve,
                color: "bg-white/20",
                stripe: true,
              },
            ]}
          />
        </div>
      </ProCard>

      <ProCard padding="sm">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2 px-1.5 pt-1">
          <div>
            <ProEyebrow>Live substreams</ProEyebrow>
            <p className="mt-1 text-[12px] text-white/45">
              {active.length} active · {fmtUsd(activeMonthly, 0)}/mo streaming
            </p>
          </div>
          <span className="text-[11px] text-white/35">
            {workspace.workers.length} total
          </span>
        </div>

        <div className="space-y-0 divide-y divide-white/[0.05] overflow-hidden rounded-2xl border border-white/[0.06]">
          <button
            type="button"
            onClick={() => setModal("worker")}
            className="flex w-full items-center gap-3 px-3.5 py-3.5 text-left transition-colors hover:bg-white/[0.04]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-white/25 text-[18px] text-white/45">
              +
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-white/85">
                Add new stream
              </p>
              <p className="mt-0.5 text-[11px] text-white/35">
                Hire a recipient onto the payroll pool
              </p>
            </div>
          </button>

          {workspace.workers.map((w) => {
            const group = workspace.groups.find((g) => g.id === w.groupId);
            const drip = monthlyToPerSec(w.monthlyUsd);
            return (
              <div
                key={w.id}
                className="flex flex-wrap items-center gap-3 px-3.5 py-3"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/8 text-[12px] font-semibold text-white/80 ring-1 ring-white/10">
                  {w.alias.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-[13px] font-medium text-white">
                    {w.alias}
                  </p>
                  <p className="truncate text-[11px] text-white/35">
                    {group?.name ?? "Ungrouped"} ·{" "}
                    {w.shieldedAddress
                      ? `${w.shieldedAddress.slice(0, 10)}…`
                      : shortAddress(w.walletAddress)}{" "}
                    · {fmtUsd(w.monthlyUsd, 0)}/mo
                    {w.status === "dripping"
                      ? ` · −${fmtUsd(drip, 4)}/s`
                      : ""}
                  </p>
                </div>
                <StatusPill status={w.status} />
                <StreamActions
                  worker={w}
                  creating={creating}
                  onStatus={setWorkerStatus}
                  onStart={createWorkerStream}
                  onSettle={settleVested}
                  onApprove={approveStream}
                  onCancel={cancelOnChain}
                  onDelete={removeWorker}
                />
              </div>
            );
          })}
        </div>
        <p className="mt-3 px-2 text-[11px] text-white/30">
          Private hires vest continuously — hit <span className="text-white/50">Pay vested</span> to
          release the earned slice to the worker, who then Scans it in. Public hires use
          pause / resume / stop.
        </p>
      </ProCard>
    </div>
  );
}

export { IconPause, IconPlay, IconStop, IconTrash };

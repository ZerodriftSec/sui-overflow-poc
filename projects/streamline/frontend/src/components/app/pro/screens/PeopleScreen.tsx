"use client";

import { useMemo, useState } from "react";

import { shortAddress } from "@/lib/format";
import { useProWorkspace } from "../ProWorkspaceContext";
import { RosterUnlockBanner } from "../RosterUnlockBanner";
import { fmtUsd, type ProWorkerStatus } from "../types";
import { ProCard, ProEyebrow, ProStat, StatusPill } from "../ui";

const STATUS_FILTERS: { id: "all" | ProWorkerStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "dripping", label: "Streaming" },
  { id: "paused", label: "Paused" },
  { id: "pending", label: "Pending" },
  { id: "stopped", label: "Stopped" },
];

export function PeopleScreen() {
  const { workspace, setModal } = useProWorkspace();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | ProWorkerStatus>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: workspace.workers.length };
    for (const f of STATUS_FILTERS) {
      if (f.id === "all") continue;
      counts[f.id] = workspace.workers.filter((w) => w.status === f.id).length;
    }
    return counts;
  }, [workspace.workers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workspace.workers.filter((w) => {
      if (status !== "all" && w.status !== status) return false;
      if (groupFilter !== "all" && w.groupId !== groupFilter) return false;
      if (!q) return true;
      return (
        w.alias.toLowerCase().includes(q) ||
        w.walletAddress.toLowerCase().includes(q)
      );
    });
  }, [workspace.workers, query, status, groupFilter]);

  const deptChipCh = Math.max(
    10,
    "Add group".length,
    ...workspace.groups.map((g) => g.name.length)
  ) + 2;

  return (
    <div className="space-y-6">
      <RosterUnlockBanner />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <ProEyebrow>People</ProEyebrow>
          <h1 className="mt-2 text-[clamp(26px,3.5vw,36px)] font-semibold tracking-tight text-white">
            Roster & stream groups
          </h1>
          <p className="mt-1 max-w-xl text-[13px] text-white/45">
            Departments are filters for the roster. Tap a group to show its
            people — edit stays on the pencil.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="sl-glass-btn-dark !px-4 !py-2 !text-[11px]"
            onClick={() => setModal("group")}
          >
            New group
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <ProStat
          label="Recipients"
          value={String(workspace.workers.length)}
          hint={`${statusCounts.dripping ?? 0} streaming`}
        />
        <ProStat
          label="Departments"
          value={String(workspace.groups.length)}
        />
        <ProStat
          label="Monthly payroll"
          value={fmtUsd(
            workspace.workers.reduce((s, w) => s + w.monthlyUsd, 0),
            0
          )}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <ProEyebrow>Departments</ProEyebrow>
          <p className="text-[11px] text-white/35">
            Select to filter · tap again to clear
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {workspace.groups.map((g) => {
            const members = workspace.workers.filter((w) => w.groupId === g.id);
            const selected = groupFilter === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() =>
                  setGroupFilter((prev) => (prev === g.id ? "all" : g.id))
                }
                style={{ width: `${deptChipCh}ch` }}
                className={`shrink-0 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  selected
                    ? "border-white/30 bg-white/[0.1]"
                    : "border-white/[0.1] bg-white/[0.03] hover:border-white/20"
                }`}
              >
                <p className="truncate text-[12px] font-semibold text-white">
                  {g.name}
                </p>
                <p className="mt-0.5 truncate text-[10px] tabular text-white/40">
                  {members.length}{" "}
                  {members.length === 1 ? "person" : "people"}
                </p>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setModal("group")}
            style={{ width: `${deptChipCh}ch` }}
            className="shrink-0 rounded-xl border border-dashed border-white/20 px-3 py-2.5 text-left text-white/45 transition-colors hover:border-white/35 hover:text-white/70"
          >
            <p className="text-[12px] font-semibold">+ Add group</p>
            <p className="mt-0.5 text-[10px] text-white/30">New department</p>
          </button>
        </div>
      </div>

      <ProCard padding="sm">
        <div className="flex flex-wrap items-center gap-2 px-1.5 pb-3 pt-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or wallet"
            className="min-w-[180px] flex-1 rounded-full border border-white/12 bg-white/[0.04] px-3 py-2 text-[12px] text-white outline-none placeholder:text-white/25"
          />
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTERS.map((f) => {
              const count = statusCounts[f.id] ?? 0;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatus(f.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider ${
                    status === f.id
                      ? "bg-white text-[#0a0a0a]"
                      : "border border-white/10 text-white/45 hover:text-white"
                  }`}
                >
                  {f.label}
                  <span
                    className={`tabular ${
                      status === f.id ? "text-[#0a0a0a]/55" : "text-white/30"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
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
              <p className="text-[13px] font-medium text-white/85">Add person</p>
              <p className="mt-0.5 text-[11px] text-white/35">
                Create a substream on the payroll roster
              </p>
            </div>
          </button>

          {filtered.map((w) => {
            const group = workspace.groups.find((g) => g.id === w.groupId);
            return (
              <button
                key={w.id}
                type="button"
                onClick={() =>
                  setModal({ kind: "worker-edit", workerId: w.id })
                }
                className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-white/[0.04]"
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
                  </p>
                </div>
                <StatusPill status={w.status} />
              </button>
            );
          })}
          {filtered.length === 0 ? (
            <p className="px-3.5 py-8 text-center text-[13px] text-white/35">
              No recipients match these filters.
            </p>
          ) : null}
        </div>
      </ProCard>
    </div>
  );
}

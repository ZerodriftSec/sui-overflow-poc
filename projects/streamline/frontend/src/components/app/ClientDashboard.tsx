"use client";

import { useMemo, useState } from "react";
import { useCurrentAccount, useSuiClientQuery } from "@mysten/dapp-kit";

import { useNetworkVariable } from "@/lib/networks";
import { useGaslessExecute } from "@/lib/use-gasless";
import { useStreams, useLiveUpdates, type StreamRecord } from "@/lib/indexer";
import {
  isAwaitingClientApproval,
  isAwaitingFreelancerRaise,
  nextMilestoneNo,
} from "@/lib/stream-state";
import {
  buildApproveMilestone,
  buildCancel,
  buildRaiseDispute,
} from "@/lib/streamline-tx";
import { PrivateStreamsPanel } from "./PrivateStreamsPanel";
import { CompletedStreams } from "./CompletedStreams";
import { DisputeResolution } from "./DisputeResolution";
import { USDC_BASE } from "@/lib/stream-math";
import {
  BarChart,
  Card,
  DashboardHeader,
  DonutProgress,
  EmptyPanel,
  StatCard,
  StateBadge,
  short,
  type BarDatum,
} from "./dashboard-ui";
import { usePhoneEmbedded } from "./phone/PhoneEmbeddedContext";
import { AddressLabel } from "@/components/wallet/AddressLabel";

/**
 * Map of stream id → owned StreamCap object id, so the client can approve.
 * NB: pass the *original* package id — Sui pins struct types to the package
 * version that defined them, regardless of upgrades.
 */
function useStreamCaps(packageId: string) {
  const account = useCurrentAccount();
  const { data } = useSuiClientQuery(
    "getOwnedObjects",
    {
      owner: account?.address ?? "",
      filter: { StructType: `${packageId}::stream::StreamCap` },
      options: { showContent: true },
    },
    { enabled: !!account && packageId !== "0x0" }
  );

  return useMemo(() => {
    const map = new Map<string, string>();
    for (const o of data?.data ?? []) {
      const content = o.data?.content;
      if (content?.dataType === "moveObject") {
        const fields = content.fields as Record<string, unknown>;
        const streamId = fields["stream_id"] as string | undefined;
        if (streamId && o.data?.objectId) map.set(streamId, o.data.objectId);
      }
    }
    return map;
  }, [data]);
}

const usd = (base: number) => (base / USDC_BASE).toFixed(2);

export function ClientDashboard() {
  const account = useCurrentAccount();
  const embedded = usePhoneEmbedded();
  const packageId = useNetworkVariable("packageId");
  const originalPackageId = useNetworkVariable("originalPackageId");
  const usdcType = useNetworkVariable("usdcType");
  const { execute, isPending } = useGaslessExecute();
  const { data: streams, isLoading, refetch } = useStreams({
    sender: account?.address,
  });
  const caps = useStreamCaps(originalPackageId);
  const [busy, setBusy] = useState<string | null>(null);

  useLiveUpdates(() => refetch());

  const list = useMemo(() => streams ?? [], [streams]);
  const activeList = useMemo(
    () => list.filter((s) => s.state !== "done"),
    [list]
  );
  const completedList = useMemo(
    () => list.filter((s) => s.state === "done"),
    [list]
  );

  const totals = useMemo(() => {
    const locked = list.reduce((a, s) => a + s.total, 0);
    const streamed = list.reduce((a, s) => a + (s.total - s.remaining), 0);
    const dripping = list.filter((s) => s.state === "dripping").length;
    const review = list.filter((s) => isAwaitingClientApproval(s)).length;
    const waiting = list.filter((s) => isAwaitingFreelancerRaise(s)).length;
    return { locked, streamed, dripping, review, waiting };
  }, [list]);

  const bars: BarDatum[] = useMemo(
    () =>
      list.slice(0, 8).map((s) => ({
        label: short(s.id).slice(0, 4),
        value: s.total - s.remaining,
        active:
          s.state === "dripping" ||
          isAwaitingClientApproval(s) ||
          isAwaitingFreelancerRaise(s),
      })),
    [list]
  );

  const progress =
    totals.locked > 0 ? (totals.streamed / totals.locked) * 100 : 0;

  const approve = (s: StreamRecord) => {
    const capId = caps.get(s.id);
    if (!capId) {
      setBusy(`${s.id}:no-cap`);
      return;
    }
    setBusy(s.id);
    execute(
      buildApproveMilestone({ packageId, usdcType, streamId: s.id, capId }),
      { onSettled: () => setBusy(null), onSuccess: () => refetch() }
    );
  };

  const dispute = (s: StreamRecord) => {
    setBusy(s.id);
    execute(buildRaiseDispute({ packageId, usdcType, streamId: s.id }), {
      onSettled: () => setBusy(null),
      onSuccess: () => refetch(),
    });
  };

  const cancel = (s: StreamRecord) => {
    const capId = caps.get(s.id);
    if (!capId) {
      setBusy(`${s.id}:no-cap`);
      return;
    }
    if (
      !window.confirm(
        `Cancel this stream and reclaim the unstreamed $${usd(s.remaining)}? ` +
          `This closes the stream for good.`
      )
    )
      return;
    setBusy(s.id);
    execute(buildCancel({ packageId, usdcType, streamId: s.id, capId }), {
      onSettled: () => setBusy(null),
      onSuccess: () => refetch(),
    });
  };

  if (isLoading) return <EmptyPanel>Loading your streams…</EmptyPanel>;

  return (
    <div>
      {!embedded && (
        <DashboardHeader
          eyebrow="Payer console"
          title="Client dashboard"
          subtitle="Lock funds, watch them stream, approve milestones as work lands."
        />
      )}

      {list.length === 0 ? (
        <div className="flex flex-col gap-6">
          <EmptyPanel>
            No streams created yet. Head to “Create stream” to lock your first.
          </EmptyPanel>
          <PrivateStreamsPanel role="sender" />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Stat row */}
          <div
            className={
              embedded
                ? "grid grid-cols-2 gap-2"
                : "grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            }
          >
            <StatCard
              tone="flow"
              label="Locked total"
              value={`$${usd(totals.locked)}`}
              sub="across all streams"
            />
            <StatCard
              label="Streamed out"
              value={`$${usd(totals.streamed)}`}
              sub="paid as work happened"
            />
            <StatCard
              label="Active streams"
              value={String(totals.dripping)}
              sub="currently dripping"
            />
            <StatCard
              label="Awaiting review"
              value={String(totals.review)}
              sub={
                totals.waiting > 0
                  ? `${totals.waiting} waiting on freelancer`
                  : "need your approval"
              }
            />
          </div>

          {/* Analytics + reminders */}
          <div className={embedded ? "flex flex-col gap-4" : "grid gap-6 lg:grid-cols-[1fr_360px]"}>
            <Card title="Stream analytics">
              <p className="-mt-2 mb-5 text-[11px] text-[#2b2a5e]/45">
                Streamed-out per stream (live + pending highlighted)
              </p>
              {bars.length > 0 ? (
                <BarChart data={bars} />
              ) : (
                <p className="py-10 text-center text-[12px] text-[#2b2a5e]/45">
                  No outflow yet.
                </p>
              )}
            </Card>

            <Card title="Overall progress">
              <DonutProgress percent={progress} caption="funds streamed" />
              <div className="mt-2 grid grid-cols-2 gap-3 text-center">
                <div className="border border-[#2b2a5e]/10 py-3">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-[#2b2a5e]/45">
                    Streamed
                  </p>
                  <p className="mt-1 text-[14px] font-bold tabular">
                    ${usd(totals.streamed)}
                  </p>
                </div>
                <div className="border border-[#2b2a5e]/10 py-3">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-[#2b2a5e]/45">
                    Remaining
                  </p>
                  <p className="mt-1 text-[14px] font-bold tabular">
                    ${usd(totals.locked - totals.streamed)}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Stream table */}
          <Card title={embedded ? undefined : "Your streams"} padded={false}>
            <div className="flex flex-col">
              {activeList.length === 0 && (
                <p className="border-t border-[#2b2a5e]/10 p-5 text-[12px] text-[#2b2a5e]/45">
                  No active streams — all settled. See completed below.
                </p>
              )}
              {activeList.map((s) => {
                const pct =
                  s.total > 0 ? ((s.total - s.remaining) / s.total) * 100 : 0;
                return (
                  <div
                    key={s.id}
                    className={`border-t border-[#2b2a5e]/10 p-5 ${embedded ? "!p-3" : ""}`}
                  >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto] md:items-center">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-mono text-[13px]">{short(s.id)}</span>
                        <StateBadge
                          state={
                            isAwaitingClientApproval(s)
                              ? "pending_review"
                              : s.state
                          }
                        />
                        <span className="text-[11px] text-[#2b2a5e]/50">
                          milestone {nextMilestoneNo(s)}/{s.n_milestones}
                        </span>
                        <span className="font-mono text-[11px] text-[#2b2a5e]/50">
                          → <AddressLabel address={s.freelancer} head={4} tail={4} />
                        </span>
                      </div>
                      <div className="flex max-w-md items-center gap-3">
                        <div className="h-1.5 flex-1 bg-[#2b2a5e]/10">
                          <div
                            className="h-full bg-[#1d9e75]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="tabular text-[11px] text-[#2b2a5e]/60">
                          ${usd(s.total - s.remaining)} / ${usd(s.total)}
                        </span>
                      </div>
                      {busy === `${s.id}:no-cap` && (
                        <span className="text-[11px] text-[#c0533a]">
                          StreamCap not found in this wallet.
                        </span>
                      )}
                      {isAwaitingFreelancerRaise(s) && (
                        <span className="text-[11px] text-[#2b2a5e]/55">
                          Freelancer hasn&apos;t submitted milestone{" "}
                          {nextMilestoneNo(s)} for review yet — nothing to
                          approve until they click &quot;apply&quot; on their
                          dashboard.
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {isAwaitingClientApproval(s) && (
                        <button
                          onClick={() => approve(s)}
                          disabled={isPending}
                          className="bg-[#1d9e75] px-4 py-2 text-[11px] uppercase tracking-[0.1em] text-white hover:opacity-90 disabled:opacity-40"
                        >
                          {busy === s.id ? "…" : "approve"}
                        </button>
                      )}
                      {(isAwaitingClientApproval(s) || s.state === "dripping") && (
                        <button
                          onClick={() => dispute(s)}
                          disabled={isPending}
                          className="border border-[#c0533a] px-4 py-2 text-[11px] uppercase tracking-[0.1em] text-[#c0533a] hover:bg-[#c0533a]/[0.06] disabled:opacity-40"
                        >
                          dispute
                        </button>
                      )}
                      {s.state !== "done" && (
                        <button
                          onClick={() => cancel(s)}
                          disabled={isPending}
                          title="Reclaim the unstreamed balance and close the stream (revocable streams only)"
                          className="border border-[#2b2a5e]/30 px-4 py-2 text-[11px] uppercase tracking-[0.1em] text-[#2b2a5e]/70 hover:border-[#c0533a] hover:text-[#c0533a] disabled:opacity-40"
                        >
                          {busy === s.id ? "…" : "cancel"}
                        </button>
                      )}
                    </div>
                    </div>
                    {s.state === "paused" && (
                      <DisputeResolution
                        streamId={s.id}
                        packageId={packageId}
                        usdcType={usdcType}
                        me={account?.address ?? ""}
                        remainingBase={s.remaining}
                        onResolved={refetch}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {completedList.length > 0 && (
            <CompletedStreams
              streams={completedList}
              counterpartyLabel="Paid to"
              counterpartyOf={(s) => s.freelancer}
            />
          )}

          <PrivateStreamsPanel role="sender" />
        </div>
      )}
    </div>
  );
}

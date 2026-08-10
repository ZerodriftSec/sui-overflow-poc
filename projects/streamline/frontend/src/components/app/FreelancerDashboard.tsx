"use client";

import { useEffect, useMemo, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";

import { useNetworkVariable } from "@/lib/networks";
import { useGaslessExecute } from "@/lib/use-gasless";
import { useStreams, useLiveUpdates, type StreamRecord } from "@/lib/indexer";
import { usePrivateStreams } from "@/lib/use-private-streams";
import { buildRaiseCompletion } from "@/lib/streamline-tx";
import { PrivateStreamsPanel } from "./PrivateStreamsPanel";
import { CompletedStreams } from "./CompletedStreams";
import { DisputeResolution } from "./DisputeResolution";
import { USDC_BASE, formatInterval } from "@/lib/stream-math";
import {
  completedMilestones,
  dripRatePerMinuteBase,
  earnedBase,
  effectiveState,
  milestoneCeilingBase,
  nextMilestoneNo,
} from "@/lib/stream-state";
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

const PRIV_STATE = [
  "locked",
  "pending_review",
  "dripping",
  "paused",
  "done",
] as const;

const usd = (base: number) => (base / USDC_BASE).toFixed(2);

export function FreelancerDashboard() {
  const account = useCurrentAccount();
  const embedded = usePhoneEmbedded();
  const packageId = useNetworkVariable("packageId");
  const usdcType = useNetworkVariable("usdcType");
  const { execute, isPending } = useGaslessExecute();
  const { data: streams, isLoading, refetch } = useStreams({
    freelancer: account?.address,
  });
  const { data: privStreams } = usePrivateStreams("freelancer");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);
  useLiveUpdates(() => refetch());

  const publicList = useMemo(() => streams ?? [], [streams]);
  const privList = useMemo(() => privStreams ?? [], [privStreams]);

  // Fully-settled public streams retire to the Completed tab and stay.
  const activePublicList = useMemo(
    () => publicList.filter((s) => effectiveState(s) !== "done"),
    [publicList]
  );
  const completedPublicList = useMemo(
    () => publicList.filter((s) => effectiveState(s) === "done"),
    [publicList]
  );

  // Unified, numbered tabs — active public + private in one switcher.
  const tabs = useMemo(
    () => [
      ...activePublicList.map((s, i) => ({
        id: s.id,
        n: i + 1,
        isPrivate: false,
        state: effectiveState(s),
      })),
      ...privList.map((s, i) => ({
        id: s.id,
        n: activePublicList.length + i + 1,
        isPrivate: true,
        state: PRIV_STATE[s.state] ?? "locked",
      })),
    ],
    [activePublicList, privList]
  );

  const showCompleted =
    selectedId === "completed" ||
    (tabs.length === 0 && completedPublicList.length > 0);
  const current = useMemo(
    () => (showCompleted ? undefined : tabs.find((t) => t.id === selectedId) ?? tabs[0]),
    [tabs, selectedId, showCompleted]
  );
  const activePublic = useMemo(
    () =>
      current && !current.isPrivate
        ? publicList.find((s) => s.id === current.id)
        : undefined,
    [current, publicList]
  );

  const totals = useMemo(() => {
    const earnedAll = publicList.reduce((a, s) => a + earnedBase(s, now), 0);
    const locked = publicList.reduce((a, s) => a + s.total, 0);
    const dripping =
      publicList.filter((s) => effectiveState(s) === "dripping").length +
      privList.filter((s) => s.state === 2).length;
    return { earnedAll, locked, dripping };
  }, [publicList, privList, now]);

  const bars: BarDatum[] = useMemo(
    () =>
      publicList.slice(0, 8).map((s) => ({
        label: short(s.id).slice(0, 4),
        value: earnedBase(s, now),
        active: effectiveState(s) === "dripping" || s.state === "pending_review",
      })),
    [publicList, now]
  );

  const onRaise = (streamId: string) => {
    setStatus("Awaiting signature…");
    execute(buildRaiseCompletion({ packageId, usdcType, streamId }), {
      onSuccess: (r) => {
        setStatus(`Milestone raised — ${r.digest.slice(0, 10)}…`);
        refetch();
      },
      onError: (e) => setStatus(e.message),
    });
  };

  if (isLoading && publicList.length === 0 && privList.length === 0) {
    return <EmptyPanel>Loading your streams…</EmptyPanel>;
  }

  const empty = tabs.length === 0 && completedPublicList.length === 0;

  return (
    <div>
      {!embedded && (
        <DashboardHeader
          eyebrow="Receiver console"
          title="Freelancer dashboard"
          subtitle="Watch money arrive in real time and raise milestones in one click."
        />
      )}

      <div
        className={
          embedded
            ? "mb-4 grid grid-cols-2 gap-2"
            : "mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        }
      >
        <StatCard
          tone="brand"
          label="Earned (all)"
          value={`$${totals.earnedAll === 0 ? "0.00" : (totals.earnedAll / USDC_BASE).toFixed(2)}`}
          sub="public streams, live"
        />
        <StatCard label="Incoming total" value={`$${usd(totals.locked)}`} sub="locked (public)" />
        <StatCard label="Active" value={String(totals.dripping)} sub="currently dripping" />
        <StatCard
          value={String(tabs.length + completedPublicList.length)}
          label="Streams"
          sub={
            completedPublicList.length > 0
              ? `${completedPublicList.length} completed`
              : "public + private 🔒"
          }
        />
      </div>

      {empty ? (
        <EmptyPanel>
          No streams yet. When a client creates one for{" "}
          <span className="font-mono">{short(account?.address)}</span> — public or
          private — it appears here as a new tab.
        </EmptyPanel>
      ) : (
        <>
          {/* Unified stream tabs */}
          <div className="mb-6 flex flex-wrap gap-2">
            {tabs.map((t) => {
              const on = t.id === current?.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-[12px] uppercase tracking-[0.08em] transition-colors ${
                    on
                      ? "bg-[#2b2a5e] text-white"
                      : "border border-[#2b2a5e]/20 text-[#2b2a5e]/70 hover:border-[#5b54e6]"
                  }`}
                >
                  <span>
                    Stream {t.n}
                    {t.isPrivate && " 🔒"}
                  </span>
                  <StateBadge state={t.state} />
                </button>
              );
            })}
            {completedPublicList.length > 0 && (
              <button
                onClick={() => setSelectedId("completed")}
                className={`flex items-center gap-2 px-4 py-2.5 text-[12px] uppercase tracking-[0.08em] transition-colors ${
                  showCompleted
                    ? "bg-[#1d9e75] text-white"
                    : "border border-[#1d9e75]/40 text-[#1d9e75] hover:border-[#1d9e75]"
                }`}
              >
                <span>Completed</span>
                <span className="tabular opacity-80">{completedPublicList.length}</span>
              </button>
            )}
          </div>

          {/* Selected stream */}
          {showCompleted ? (
            <CompletedStreams
              streams={completedPublicList}
              counterpartyLabel="Client"
              counterpartyOf={(s) => s.sender}
            />
          ) : current?.isPrivate ? (
            <PrivateStreamsPanel role="freelancer" only={current.id} />
          ) : activePublic ? (
            <PublicStreamView
              active={activePublic}
              now={now}
              isPending={isPending}
              status={status}
              bars={bars}
              onRaise={() => onRaise(activePublic.id)}
              packageId={packageId}
              usdcType={usdcType}
              me={account?.address ?? ""}
              onResolved={refetch}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function PublicStreamView({
  active,
  now,
  isPending,
  status,
  bars,
  onRaise,
  packageId,
  usdcType,
  me,
  onResolved,
}: {
  active: StreamRecord;
  now: number;
  isPending: boolean;
  status: string | null;
  bars: BarDatum[];
  onRaise: () => void;
  packageId: string;
  usdcType: string;
  me: string;
  onResolved: () => void;
}) {
  const rate = active.duration_ms > 0 ? active.total / active.duration_ms : 0;
  const ratePerSec = (rate * 1000) / USDC_BASE;
  const earned = earnedBase(active, now) / USDC_BASE;
  const activeProgress =
    active.total > 0 ? (earnedBase(active, now) / active.total) * 100 : 0;
  const view = effectiveState(active);
  const done = completedMilestones(active);
  const next = nextMilestoneNo(active);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-6">
        <Card>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#2b2a5e]/50">
            Earned so far · {short(active.id)}
          </p>
          <p className="mt-2 text-[clamp(38px,7vw,68px)] font-black leading-none tabular text-[#2b2a5e]">
            ${earned.toFixed(6)}
          </p>
          <p className="mt-3 text-[13px] text-[#1d9e75]">
            {view === "dripping"
              ? `+$${ratePerSec.toFixed(6)} / sec · live, gasless`
              : view === "locked"
                ? `Milestone ${done} finished — apply for milestone ${next}`
                : `Status: ${view.replace("_", " ")}`}
          </p>

          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat
              label="Milestone"
              value={
                view === "locked"
                  ? `${done}/${active.n_milestones} done · next ${next}`
                  : `${next}/${active.n_milestones}`
              }
            />
            <Stat label="Settles every" value={formatInterval(active.drip_interval_ms)} />
            <Stat label="Locked" value={`$${usd(active.total)}`} />
            <Stat label="Remaining" value={`$${usd(active.remaining)}`} />
          </div>

          <MilestoneAction stream={active} isPending={isPending} onRaise={onRaise} />
          {view === "paused" && (
            <DisputeResolution
              streamId={active.id}
              packageId={packageId}
              usdcType={usdcType}
              me={me}
              remainingBase={active.remaining}
              onResolved={onResolved}
            />
          )}
          {status && <p className="mt-4 text-[11px] text-[#2b2a5e]/70">{status}</p>}
        </Card>

        <Card title="Earnings analytics">
          <p className="-mt-2 mb-5 text-[11px] text-[#2b2a5e]/45">
            Earned per stream (live + pending highlighted)
          </p>
          <BarChart data={bars} />
        </Card>
      </div>

      <aside className="flex flex-col gap-6">
        <Card title="Stream progress">
          <DonutProgress percent={activeProgress} caption="of this stream" size={180} />
        </Card>
      </aside>
    </div>
  );
}

function MilestoneAction({
  stream,
  isPending,
  onRaise,
}: {
  stream: StreamRecord;
  isPending: boolean;
  onRaise: () => void;
}) {
  const total = stream.n_milestones;
  const view = effectiveState(stream);
  const done = completedMilestones(stream);
  const next = nextMilestoneNo(stream);

  return (
    <div className="mt-6">
      <div className="mb-4 flex flex-wrap gap-1.5">
        {Array.from({ length: total }).map((_, i) => {
          const isDone = i < done;
          const isCurrent = i === done && view !== "done";
          return (
            <span
              key={i}
              title={`Milestone ${i + 1} of ${total}`}
              className={`flex h-6 min-w-6 items-center justify-center px-2 text-[10px] font-semibold tabular ${
                isDone
                  ? "bg-[#1d9e75] text-white"
                  : isCurrent
                    ? "border border-[#5b54e6] text-[#5b54e6]"
                    : "border border-[#2b2a5e]/20 text-[#2b2a5e]/40"
              }`}
            >
              {i + 1}
            </span>
          );
        })}
      </div>

      {view === "locked" && (
        <div className="flex flex-col gap-3">
          <p className="text-[14px] font-semibold text-[#1d9e75]">
            Milestone {done} finished
          </p>
          <p className="text-[12px] text-[#2b2a5e]/70">
            Apply for milestone {next} when your work is ready — the client will
            review, then dripping resumes.
          </p>
          <button
            onClick={onRaise}
            disabled={isPending}
            className="self-start bg-[#5b54e6] px-6 py-3 text-[12px] uppercase tracking-[0.1em] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {isPending ? "submitting…" : `apply for milestone ${next} — gasless`}
          </button>
        </div>
      )}

      {view === "pending_review" && (
        <p className="text-[12px] text-[#2b2a5e]/70">
          Milestone {next} submitted — awaiting client approval.
        </p>
      )}

      {view === "dripping" && (
        <p className="text-[12px] text-[#2b2a5e]/70">
        </p>
      )}

      {view === "paused" && (
        <p className="text-[12px] text-[#b4541f]">
          Stream paused.
        </p>
      )}

      {view === "done" && (
        <p className="text-[12px] text-[#1d9e75]">
          All {total} milestones complete — stream fully settled.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#2b2a5e]/15 px-4 py-4">
      <p className="text-[10px] uppercase tracking-[0.14em] text-[#2b2a5e]/50">
        {label}
      </p>
      <p className="mt-1 text-[15px] font-semibold tabular">{value}</p>
    </div>
  );
}

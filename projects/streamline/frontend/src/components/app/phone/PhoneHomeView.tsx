"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useCurrentAccount,
  useSuiClient,
  useSuiClientQuery,
} from "@mysten/dapp-kit";
import { useQueries } from "@tanstack/react-query";

import {
  fetchStreamDrips,
  useAuditEvents,
  useLiveUpdates,
  useStreams,
  type StreamRecord,
} from "@/lib/indexer";
import { usdFromBase } from "@/lib/compliance";
import {
  auditToActivityItem,
  labelForKind,
  type UserActivityItem,
} from "@/lib/user-activity";
import { useNetworkVariable } from "@/lib/networks";
import { USDC_BASE } from "@/lib/stream-math";
import {
  dripRatePerMinuteBase,
  earnedBase,
  effectiveState,
  isAwaitingClientApproval,
  isAwaitingFreelancerRaise,
  isStreamIncoming,
  isStreamIncomingParties,
  isStreamOutgoing,
  liveRemainingBase,
  paidBase,
  pendingAccrualBase,
} from "@/lib/stream-state";
import { resolveStreamLabel } from "@/lib/stream-labels";
import {
  clearPendingBorrow,
  loanForStream,
  readPendingBorrows,
} from "@/lib/loan-ui";
import { useLending } from "@/lib/use-lending";
import { useGaslessExecute } from "@/lib/use-gasless";
import { buildRaiseCompletion, buildApproveMilestone } from "@/lib/streamline-tx";
import { usePrivateStreams } from "@/lib/use-private-streams";
import type { PrivateStreamOnChain } from "@/lib/private-streams";
import {
  loadEngagements,
  type PrivateEngagementSecret,
} from "@/lib/private-engagement-store";
import {
  scanIncomingEngagements,
  type IncomingEngagement,
} from "@/lib/shielded";
import { getSpendKey } from "@/lib/shielded-store";
import { HideBalanceCard } from "@/components/app/HideBalanceCard";
import {
  PhoneDashboardView,
  type PhoneTopStat,
  type StreamCardData,
} from "./PhoneDashboardView";
import { PhoneActivityDetailModal } from "./PhoneActivityDetailModal";
import { PhoneStreamsPanel } from "./PhoneStreamsPanel";
import { PhoneStreamDetailsView } from "./PhoneStreamDetailsView";
import { PrivateStreamsPanel } from "../PrivateStreamsPanel";

const usd = (base: number, digits = 2) =>
  (base / USDC_BASE).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

function formatRelative(ms: number, now: number): string {
  const diff = Math.max(0, now - ms);
  if (diff < 60_000) return `${Math.max(1, Math.floor(diff / 1000))}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 172_800_000) return "Yesterday";
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isActiveStream(s: StreamRecord): boolean {
  return s.state !== "done";
}

/** Human-readable reason a stream is or isn't flowing. */
function streamStatusLabel(s: StreamRecord, addr?: string): string {
  if (effectiveState(s) === "dripping") return "Dripping";
  if (isAwaitingClientApproval(s)) {
    return addr && isStreamOutgoing(s, addr) ? "Approve to start" : "Awaiting approval";
  }
  if (isAwaitingFreelancerRaise(s)) {
    return addr && isStreamOutgoing(s, addr)
      ? "Waiting for request start"
      : "Awaiting completion";
  }
  if (s.state === "done") return "Completed";
  if (s.state === "paused") return "Paused";
  return "Idle";
}

// NB: public streams are never private — confidential streams come from a
// separate source (usePrivateStreams) and are tagged explicitly below.
function streamBackLabel(s: StreamRecord, addr: string): string {
  if (isStreamIncoming(s, addr)) return "Work stream";
  if (isStreamOutgoing(s, addr)) return "Pay stream";
  return "Stream";
}

/** Numeric on-chain state → label for confidential streams. */
const PRIV_STATE_LABEL: Record<number, string> = {
  0: "Awaiting completion",
  1: "Awaiting approval",
  2: "Dripping",
  3: "Paused",
  4: "Completed",
};

function PrivateStreamCard({
  p,
  isIncoming,
  onOpen,
}: {
  p: PrivateStreamOnChain;
  isIncoming: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-2xl border border-[#6c5ce7]/25 bg-white p-3.5 text-left shadow-[0_4px_20px_rgba(0,0,0,0.05)] transition-colors hover:border-[#6c5ce7]/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold tracking-tight text-[#111]">
            Private stream
          </p>
          <p className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.12em] text-[#888]">
            {isIncoming ? "Incoming" : "Outgoing"}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[#6c5ce7]/12 px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] text-[#6c5ce7]">
          🔒 Private
        </span>
      </div>
      <p className="mt-3 text-[18px] font-bold tabular-nums leading-none text-[#111]">
        {usd(Number(p.reserve), 2)}
        <span className="ml-1.5 text-[10px] font-medium text-[#888]">
          locked reserve
        </span>
      </p>
      <p className="mt-2 text-[10px] text-[#666]">
        {PRIV_STATE_LABEL[p.state] ?? "—"} · milestone {p.currentMilestone + 1}/
        {p.nMilestones}
      </p>
      <p className="mt-2 text-[9px] leading-snug text-[#999]">
        Amounts are encrypted on-chain — only the locked reserve is public.
      </p>
      <p className="mt-2 text-[9px] font-semibold text-[#6c5ce7]">
        Tap to unlock &amp; drip →
      </p>
    </button>
  );
}

/** A private engagement the connected wallet opened (default-private path).
 * No parties on-chain — the value shown comes from the local opening secret;
 * the pool only reveals the public boundary, so amounts stay hidden. */
function EngagementCard({ e }: { e: PrivateEngagementSecret }) {
  return (
    <div className="w-full rounded-2xl border border-[#6c5ce7]/25 bg-white p-3.5 text-left shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold tracking-tight text-[#111]">
            {e.label || "Private engagement"}
          </p>
          <p className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.12em] text-[#888]">
            Outgoing · you opened
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[#6c5ce7]/12 px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] text-[#6c5ce7]">
          🔒 Private
        </span>
      </div>
      <p className="mt-3 text-[18px] font-bold tabular-nums leading-none text-[#111]">
        {usd(Number(e.fundingValue), 2)}
        <span className="ml-1.5 text-[10px] font-medium text-[#888]">
          work value
        </span>
      </p>
      <p className="mt-2 text-[9px] leading-snug text-[#999]">
        Deposited into the shielded pool — no sender, recipient, or amount is
        on-chain. The worker claims it privately by scanning their notes.
      </p>
    </div>
  );
}

/** A private engagement addressed TO the connected wallet, discovered by scanning
 * encrypted announcements. Shows the vesting projection live; funds arrive as the
 * sender settles. No on-chain party — only the recipient can decrypt this. */
function IncomingEngagementCard({
  e,
  now,
}: {
  e: IncomingEngagement;
  now: number;
}) {
  const cap = Number(e.cap);
  const rate = Number(e.rate); // base units / second
  const start = Number(e.start); // unix seconds
  const elapsed = Math.max(0, Math.floor(now / 1000) - start);
  const vested = Math.min(cap, rate * elapsed);
  const pct = cap > 0 ? Math.min(100, (vested / cap) * 100) : 0;
  return (
    <div className="w-full rounded-2xl border border-[#6c5ce7]/25 bg-white p-3.5 text-left shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold tracking-tight text-[#111]">
            {e.label || "Private engagement"}
          </p>
          <p className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.12em] text-[#888]">
            Incoming · to you
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[#6c5ce7]/12 px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] text-[#6c5ce7]">
          🔒 Private
        </span>
      </div>
      <p className="mt-3 text-[18px] font-bold tabular-nums leading-none text-[#111]">
        {usd(vested, 2)}
        <span className="ml-1.5 text-[10px] font-medium text-[#888]">
          vesting to you
        </span>
      </p>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#6c5ce7]/10">
        <div
          className="h-full rounded-full bg-[#6c5ce7] transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-[9px] leading-snug text-[#999]">
        Only your wallet can see this — {usd(cap, 0)} cap. Settled privately by the
        sender; claimable notes arrive as it vests.
      </p>
    </div>
  );
}

type PhoneHomeViewProps = {
  showAllStreams?: boolean;
  onShowAllStreams?: () => void;
  onBackToHome?: () => void;
  onCreate?: () => void;
  onRequest?: () => void;
  onTransfer?: () => void;
  onBuy?: () => void;
};

type HomeDetailsView =
  | { kind: "home" }
  | { kind: "total" }
  | { kind: "stream"; id: string }
  | { kind: "private"; id: string; role: "sender" | "freelancer" };

export function PhoneHomeView({
  showAllStreams = false,
  onShowAllStreams,
  onBackToHome,
  onCreate,
  onRequest,
  onTransfer,
  onBuy,
}: PhoneHomeViewProps) {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const usdcType = useNetworkVariable("usdcType");
  const packageId = useNetworkVariable("packageId");
  // StreamCap types are pinned to the package that defined them — use original id.
  const originalPackageId = useNetworkVariable("originalPackageId");
  const { execute, isPending } = useGaslessExecute();
  const pool = useLending();
  const [pendingBorrows, setPendingBorrows] = useState(readPendingBorrows);
  const [now, setNow] = useState(() => Date.now());
  const [lastWalletBase, setLastWalletBase] = useState(0);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [detailsView, setDetailsView] = useState<HomeDetailsView>({ kind: "home" });
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [selectedActivity, setSelectedActivity] =
    useState<UserActivityItem | null>(null);
  const addr = account?.address;

  const incomingQ = useStreams({ freelancer: addr });
  const outgoingQ = useStreams({ sender: addr });
  // Owned StreamCaps → map of stream id → cap object id, so the client (sender)
  // can approve a milestone in review.
  const capsQ = useSuiClientQuery(
    "getOwnedObjects",
    {
      owner: addr ?? "",
      filter: { StructType: `${originalPackageId}::stream::StreamCap` },
      options: { showContent: true },
    },
    { enabled: !!addr && originalPackageId !== "0x0" }
  );
  const streamCaps = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of capsQ.data?.data ?? []) {
      const content = o.data?.content;
      if (content?.dataType === "moveObject") {
        const fields = content.fields as Record<string, unknown>;
        const sid = fields["stream_id"] as string | undefined;
        if (sid && o.data?.objectId) map.set(sid, o.data.objectId);
      }
    }
    return map;
  }, [capsQ.data]);

  // Confidential streams live off the public indexer (amounts hidden); pull both
  // roles so they can be shown alongside public ones, tagged Private.
  const privIncomingQ = usePrivateStreams("freelancer");
  const privOutgoingQ = usePrivateStreams("sender");
  const privateStreams = useMemo(() => {
    const inc = privIncomingQ.data ?? [];
    const out = privOutgoingQ.data ?? [];
    return [...inc, ...out.filter((o) => !inc.some((i) => i.id === o.id))];
  }, [privIncomingQ.data, privOutgoingQ.data]);
  const balanceQ = useSuiClientQuery(
    "getBalance",
    {
      owner: addr ?? "",
      coinType: usdcType,
    },
    { enabled: !!addr && !!usdcType }
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const next = balanceQ.data?.totalBalance;
    if (next !== undefined && next !== null) {
      setLastWalletBase(Number(next));
    }
  }, [balanceQ.data?.totalBalance]);

  const incoming = incomingQ.data ?? [];
  const outgoing = outgoingQ.data ?? [];
  const allStreams = useMemo(
    () => [...incoming, ...outgoing.filter((o) => !incoming.some((i) => i.id === o.id))],
    [incoming, outgoing]
  );

  const activityStreamIds = useMemo(
    () => allStreams.slice(0, 8).map((s) => s.id),
    [allStreams]
  );

  const dripQueries = useQueries({
    queries: activityStreamIds.map((id) => ({
      queryKey: ["drips", id],
      queryFn: () => fetchStreamDrips(id),
      enabled: !!id,
      refetchInterval: 20_000,
    })),
  });

  const auditQ = useAuditEvents({
    party: addr,
    limit: 40,
  });

  const refetchDrips = () => {
    dripQueries.forEach((q) => q.refetch());
  };

  const loanKey = pool.loans
    .map((l) => `${l.loanId}:${l.streamId}`)
    .sort()
    .join("|");

  useLiveUpdates(() => {
    incomingQ.refetch();
    outgoingQ.refetch();
    privIncomingQ.refetch();
    privOutgoingQ.refetch();
    balanceQ.refetch();
    refetchDrips();
    auditQ.refetch();
    pool.refetch();
    setPendingBorrows(readPendingBorrows());
  });

  useEffect(() => {
    for (const loan of pool.loans) {
      clearPendingBorrow(loan.streamId);
    }
    setPendingBorrows(readPendingBorrows());
  }, [loanKey]);

  const activeStreams = useMemo(
    () => allStreams.filter(isActiveStream),
    [allStreams]
  );

  // Private engagements live only in the local opening store (no on-chain
  // parties, not indexed). Poll it so one opened moments ago shows up here.
  const [engagements, setEngagements] = useState<PrivateEngagementSecret[]>([]);
  useEffect(() => {
    if (!addr) {
      setEngagements([]);
      return;
    }
    const load = () => setEngagements(loadEngagements(addr));
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [addr]);

  // Receive side of private engagements: ambiently scan encrypted announcements
  // addressed to this wallet's shielded key. No on-chain party — only we can
  // decrypt our own. Runs on the home so privacy is ambient, not a separate vault.
  const [incomingEngagements, setIncomingEngagements] = useState<
    IncomingEngagement[]
  >([]);
  useEffect(() => {
    if (!addr || !packageId || packageId === "0x0") {
      setIncomingEngagements([]);
      return;
    }
    let cancelled = false;
    const scan = async () => {
      try {
        const found = await scanIncomingEngagements(
          client,
          packageId,
          getSpendKey(addr)
        );
        if (!cancelled) setIncomingEngagements(found);
      } catch {
        /* transient RPC hiccup — keep the last scan */
      }
    };
    scan();
    const t = setInterval(scan, 15000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [addr, packageId, client]);

  const incomingDripping = useMemo(
    () => incoming.filter((s) => effectiveState(s) === "dripping"),
    [incoming]
  );

  const outgoingDripping = useMemo(
    () => outgoing.filter((s) => effectiveState(s) === "dripping"),
    [outgoing]
  );

  const liveAccrualBase = useMemo(
    () =>
      incomingDripping.reduce((acc, s) => acc + pendingAccrualBase(s, now), 0),
    [incomingDripping, now]
  );

  const outgoingAccrualBase = useMemo(
    () =>
      outgoingDripping.reduce((acc, s) => acc + pendingAccrualBase(s, now), 0),
    [outgoingDripping, now]
  );

  const netLiveBase = liveAccrualBase - outgoingAccrualBase;

  const macroCard = useMemo(() => {
    const walletBase =
      balanceQ.data?.totalBalance !== undefined &&
      balanceQ.data?.totalBalance !== null
        ? Number(balanceQ.data.totalBalance)
        : lastWalletBase;
    return {
      id: "macro",
      label: "Total balance",
      amount: usd(walletBase + netLiveBase, 3),
      subtitle: "",
    };
  }, [
    balanceQ.data?.totalBalance,
    lastWalletBase,
    netLiveBase,
  ]);

  const streamCards = useMemo(() => {
    return [...activeStreams]
      .sort((a, b) => a.created_at_ms - b.created_at_ms)
      .map((s, i) => {
        const isIncoming = addr ? isStreamIncoming(s, addr) : false;
        const dripping = effectiveState(s) === "dripping";
        const loan = loanForStream(s.id, pool.loans, pendingBorrows);
        const paid = paidBase(s);
        const value = dripping
          ? isIncoming
            ? earnedBase(s, now)
            : liveRemainingBase(s, now)
          : isIncoming
            ? s.total
            : s.remaining;
        const status = loan
          ? "Repaying loan"
          : dripping
            ? ""
            : streamStatusLabel(s, addr);
        return {
          id: s.id,
          label: resolveStreamLabel(s) ?? (addr ? streamBackLabel(s, addr) : "Stream"),
          amount: usd(value, 3),
          subtitle: status,
          isLive: dripping,
          liveOutgoing: !isIncoming && dripping,
          amountDecreasing: !isIncoming && dripping,
          meta: loan
            ? `Borrowed ${usd(loan.principalBase, 0)} · owe ${usd(loan.owedBase, 0)}`
            : isIncoming
              ? `Incoming · ${usd(s.remaining, 0)} left`
              : `Outgoing · ${usd(paid, 0)} paid · ${usd(s.remaining, 0)} left`,
        };
      });
  }, [activeStreams, addr, now, pool.loans, pendingBorrows]);

  const cards = useMemo(() => [macroCard, ...streamCards], [macroCard, streamCards]);

  useEffect(() => {
    if (cards.length === 0) {
      setActiveCardIndex(0);
      return;
    }
    setActiveCardIndex((prev) => ((prev % cards.length) + cards.length) % cards.length);
  }, [cards.length]);

  const shiftCards = () => {
    if (cards.length <= 1) return;
    setActiveCardIndex((prev) => (prev + 1) % cards.length);
  };

  const openActiveCard = () => {
    const active = cards[((activeCardIndex % cards.length) + cards.length) % cards.length];
    if (!active) return;
    if (active.id === "macro") {
      setDetailsView({ kind: "total" });
      return;
    }
    setDetailsView({ kind: "stream", id: active.id });
  };

  const selectedStream = useMemo(
    () =>
      detailsView.kind === "stream"
        ? allStreams.find((s) => s.id === detailsView.id)
        : undefined,
    [detailsView, allStreams]
  );

  const topStats = useMemo((): PhoneTopStat[] => {
    const streamCount = allStreams.length;
    const incomingRate = incomingDripping.reduce(
      (acc, s) => acc + dripRatePerMinuteBase(s),
      0
    );
    const outgoingRate = outgoingDripping.reduce(
      (acc, s) => acc + dripRatePerMinuteBase(s),
      0
    );
    const netRatePerMinuteBase = incomingRate - outgoingRate;

    return [
      {
        label: "Drip/min",
        value: usd(netRatePerMinuteBase, 3),
        live: netRatePerMinuteBase > 0,
        negative: netRatePerMinuteBase < 0,
      },
      { label: "Streams", value: String(streamCount) },
    ];
  }, [allStreams, incomingDripping, outgoingDripping]);

  const activity = useMemo((): UserActivityItem[] => {
    const auditItems = (auditQ.data ?? []).map((e) =>
      auditToActivityItem(e, formatRelative, now)
    );

    const loanItems: UserActivityItem[] = pool.loans.map((l) => ({
      id: `loan-${l.loanId}`,
      kind: "borrow_opened",
      title: labelForKind("borrow_opened"),
      time: formatRelative(l.openedMs, now),
      timestampMs: l.openedMs,
      amount: usdFromBase(l.principalBase),
      amountBase: l.principalBase,
      subjectId: l.streamId,
      counterparty: null,
      txDigest: null,
      module: "lending",
      metaJson: null,
    }));

    const pendingItems: UserActivityItem[] = pendingBorrows
      .filter((p) => !pool.loans.some((l) => l.streamId === p.streamId))
      .map((p) => ({
        id: `pending-${p.streamId}-${p.at}`,
        kind: "borrow_pending",
        title: labelForKind("borrow_pending"),
        time: formatRelative(p.at, now),
        timestampMs: p.at,
        amount: usdFromBase(p.principalBase),
        amountBase: p.principalBase,
        subjectId: p.streamId,
        counterparty: null,
        txDigest: null,
        module: "lending",
        metaJson: null,
      }));

    // Prefer indexer audit trail; keep local borrow rows + drip fallback when empty.
    if (auditItems.length > 0) {
      return [...loanItems, ...pendingItems, ...auditItems]
        .sort((a, b) => b.timestampMs - a.timestampMs)
        .slice(0, 8);
    }

    const drips = dripQueries.flatMap((q) => q.data ?? []);
    const dripItems: UserActivityItem[] = drips
      .sort((a, b) => b.timestamp_ms - a.timestamp_ms)
      .map((d) => ({
        id: `drip-${d.stream_id}-${d.id}`,
        kind: "stream_dripped",
        title: labelForKind("stream_dripped"),
        time: formatRelative(d.timestamp_ms, now),
        timestampMs: d.timestamp_ms,
        amount: `+${usdFromBase(d.amount)}`,
        amountBase: d.amount,
        subjectId: d.stream_id,
        counterparty: null,
        txDigest: d.tx_digest,
        module: "stream",
        metaJson: null,
      }));

    const streamItems: UserActivityItem[] = allStreams.map((s) => {
      const incoming = !!(addr && isStreamIncoming(s, addr));
      const kind = incoming ? "stream_request" : "stream_funded";
      return {
        id: `stream-${s.id}`,
        kind,
        title: labelForKind(kind),
        time: formatRelative(s.created_at_ms, now),
        timestampMs: s.created_at_ms,
        amount: null,
        amountBase: null,
        subjectId: s.id,
        counterparty: incoming ? s.sender : s.freelancer,
        txDigest: null,
        module: "stream",
        metaJson: null,
      };
    });

    return [...loanItems, ...pendingItems, ...dripItems, ...streamItems]
      .sort((a, b) => b.timestampMs - a.timestampMs)
      .slice(0, 8);
  }, [
    auditQ.data,
    dripQueries,
    allStreams,
    now,
    addr,
    pool.loans,
    pendingBorrows,
  ]);

  const activityLoading =
    !!addr &&
    ((auditQ.isLoading && !auditQ.data) ||
      (activityStreamIds.length > 0 &&
        !auditQ.data?.length &&
        dripQueries.some((q) => q.isLoading)));

  const handleQuickAction = (id: string) => {
    if (id === "create") onCreate?.();
    if (id === "request") onRequest?.();
    if (id === "transfer") onTransfer?.();
    if (id === "buy") onBuy?.();
  };

  const onRaiseCompletion = (streamId: string) => {
    setActionStatus("Awaiting signature…");
    execute(buildRaiseCompletion({ packageId, usdcType, streamId }), {
      onSuccess: (r) => {
        setActionStatus(`Milestone raised — ${r.digest.slice(0, 10)}…`);
        incomingQ.refetch();
        outgoingQ.refetch();
      },
      onError: (e) => setActionStatus(e.message),
    });
  };

  const onApproveMilestone = (streamId: string) => {
    const capId = streamCaps.get(streamId);
    if (!capId) {
      setActionStatus("No approval permission (StreamCap) found for this stream.");
      return;
    }
    setActionStatus("Awaiting signature…");
    execute(buildApproveMilestone({ packageId, usdcType, streamId, capId }), {
      onSuccess: (r) => {
        setActionStatus(`Milestone approved — ${r.digest.slice(0, 10)}…`);
        incomingQ.refetch();
        outgoingQ.refetch();
      },
      onError: (e) => setActionStatus(e.message),
    });
  };

  const openStream = (id: string) => {
    setActionStatus(null);
    setDetailsView({ kind: "stream", id });
  };

  if (showAllStreams) {
    return (
      <div className="sl-scrollbar-hidden flex min-h-0 flex-1 flex-col overflow-y-auto">
        <button
          type="button"
          onClick={onBackToHome}
          className="mb-3 self-start text-[9px] font-medium text-[#666]"
        >
          ← Home
        </button>
        <PhoneStreamsPanel />
      </div>
    );
  }

  if (detailsView.kind === "total") {
    return (
      <div className="sl-scrollbar-hidden flex min-h-0 flex-1 flex-col overflow-y-auto">
        <button
          type="button"
          onClick={() => setDetailsView({ kind: "home" })}
          className="mb-3 self-start text-[9px] font-medium text-[#666]"
        >
          ← Home
        </button>
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight text-[#111]">
              Active streams
            </h2>
            <p className="mt-1 text-[12px] leading-snug text-[#666]">
              Open a stream to see full details.
            </p>
          </div>
          {activeStreams.length === 0 &&
          privateStreams.length === 0 &&
          engagements.length === 0 &&
          incomingEngagements.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/10 bg-white px-3 py-6 text-center">
              <p className="text-[12px] font-medium text-[#555]">No streams yet</p>
              <p className="mt-1 text-[11px] text-[#888]">
                Create a stream or accept a request to get started.
              </p>
            </div>
          ) : (
            <>
            {activeStreams.map((s, i) => {
              const dripping = effectiveState(s) === "dripping";
              const isIncoming = addr ? isStreamIncoming(s, addr) : false;
              const loan = loanForStream(s.id, pool.loans, pendingBorrows);
              const progress = isIncoming
                ? s.total > 0
                  ? Math.min(100, (earnedBase(s, now) / s.total) * 100)
                  : 0
                : s.total > 0
                  ? Math.min(100, (paidBase(s) / s.total) * 100)
                  : 0;
              const displayAmount = dripping
                ? isIncoming
                  ? earnedBase(s, now)
                  : liveRemainingBase(s, now)
                : isIncoming
                  ? s.total
                  : s.remaining;
              const label =
                resolveStreamLabel(s) ?? (addr ? streamBackLabel(s, addr) : "Stream");

              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => openStream(s.id)}
                  className="rounded-2xl border border-black/8 bg-white p-3.5 text-left shadow-[0_4px_20px_rgba(0,0,0,0.05)] transition-colors hover:border-black/14"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold tracking-tight text-[#111]">
                        {label}
                      </p>
                      <p className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.12em] text-[#888]">
                        {isIncoming ? "Incoming" : "Outgoing"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] ${
                        loan
                          ? "bg-[#e85d2a]/12 text-[#e85d2a]"
                          : dripping
                            ? isIncoming
                              ? "bg-[#1d9e75]/10 text-[#1d9e75]"
                              : "bg-[#c0533a]/10 text-[#c0533a]"
                            : "bg-black/5 text-[#777]"
                      }`}
                    >
                      {loan ? "Repaying" : streamStatusLabel(s)}
                    </span>
                  </div>

                  <p
                    className={`mt-3 text-[18px] font-bold tabular-nums leading-none ${
                      dripping && !isIncoming ? "text-[#9a3b28]" : "text-[#111]"
                    }`}
                  >
                    {usd(displayAmount, 2)}
                    <span className="ml-1.5 text-[10px] font-medium text-[#888]">
                      {dripping
                        ? isIncoming
                          ? "earned"
                          : "remaining"
                        : isIncoming
                          ? "locked"
                          : "remaining"}
                    </span>
                  </p>

                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-black/[0.06]">
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ${
                        dripping
                          ? isIncoming
                            ? "bg-[#1d9e75]"
                            : "bg-[#c0533a]/80"
                          : "bg-[#5b54e6]/50"
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-black/6 pt-2.5">
                    <div>
                      <p className="text-[7px] font-semibold uppercase tracking-[0.12em] text-[#aaa]">
                        Remaining
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold tabular-nums text-[#333]">
                        {usd(s.remaining, 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[7px] font-semibold uppercase tracking-[0.12em] text-[#aaa]">
                        Milestone
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold tabular-nums text-[#333]">
                        {s.current_milestone + 1}/{s.n_milestones}
                      </p>
                    </div>
                    <div>
                      <p className="text-[7px] font-semibold uppercase tracking-[0.12em] text-[#aaa]">
                        Drip/min
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold tabular-nums text-[#333]">
                        {usd(dripRatePerMinuteBase(s), 2)}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
            {privateStreams.map((p) => {
              const isIncoming = addr
                ? isStreamIncomingParties(p, addr)
                : false;
              return (
                <PrivateStreamCard
                  key={p.id}
                  p={p}
                  isIncoming={isIncoming}
                  onOpen={() =>
                    setDetailsView({
                      kind: "private",
                      id: p.id,
                      role: isIncoming ? "freelancer" : "sender",
                    })
                  }
                />
              );
            })}
            {engagements.map((e) => (
              <EngagementCard key={e.engagementId} e={e} />
            ))}
            {incomingEngagements.map((e) => (
              <IncomingEngagementCard key={e.id} e={e} now={now} />
            ))}
            </>
          )}
        </div>
      </div>
    );
  }

  if (detailsView.kind === "private") {
    const view = detailsView;
    return (
      <div className="sl-scrollbar-hidden flex min-h-0 flex-1 flex-col overflow-y-auto">
        <button
          type="button"
          onClick={() => setDetailsView({ kind: "home" })}
          className="mb-3 self-start text-[9px] font-medium text-[#666]"
        >
          ← Home
        </button>
        <PrivateStreamsPanel role={view.role} only={view.id} />
      </div>
    );
  }

  if (detailsView.kind === "stream" && selectedStream) {
    const streamIndex = allStreams.findIndex((s) => s.id === selectedStream.id);
    return (
      <PhoneStreamDetailsView
        stream={selectedStream}
        label={
          resolveStreamLabel(selectedStream) ??
          (addr ? streamBackLabel(selectedStream, addr) : "Stream")
        }
        incoming={addr ? isStreamIncoming(selectedStream, addr) : false}
        now={now}
        onBack={() => setDetailsView({ kind: "home" })}
        onRaiseMilestone={onRaiseCompletion}
        onApproveMilestone={onApproveMilestone}
        raising={isPending}
        raiseStatus={actionStatus}
        onBorrowed={() => {
          pool.refetch();
          setPendingBorrows(readPendingBorrows());
          // Borrowed USDC lands in the wallet — refresh the balance now and
          // again after RPC propagation settles.
          balanceQ.refetch();
          window.setTimeout(() => balanceQ.refetch(), 2500);
        }}
      />
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" data-demo="home-streams">
      <PhoneDashboardView
        cards={cards}
        activeCardIndex={activeCardIndex}
        topStats={topStats}
        activity={activity}
        activityLoading={activityLoading}
        onQuickAction={handleQuickAction}
        onActivityClick={setSelectedActivity}
        onShiftCards={shiftCards}
        onPrimaryCardClick={openActiveCard}
        onPrimaryCardDetails={openActiveCard}
        trailing={
          <div className="mx-3 mt-1">
            <HideBalanceCard variant="light" />
          </div>
        }
      />
      {selectedActivity && addr && (
        <PhoneActivityDetailModal
          item={selectedActivity}
          party={addr}
          onClose={() => setSelectedActivity(null)}
        />
      )}
    </div>
  );
}
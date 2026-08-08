import type { StreamRecord } from "./indexer";

export type StreamState = StreamRecord["state"];

export function normalizeSuiAddress(addr: string): string {
  return addr.toLowerCase();
}

/** Paying client / sponsor who locked funds and approves milestones. */
export function isStreamOutgoingParties(
  stream: Pick<StreamRecord, "sender" | "freelancer">,
  addr: string
): boolean {
  return normalizeSuiAddress(stream.sender) === normalizeSuiAddress(addr);
}

/** Recipient / freelancer view — never when the same wallet is also the sender. */
export function isStreamIncomingParties(
  stream: Pick<StreamRecord, "sender" | "freelancer">,
  addr: string
): boolean {
  if (isStreamOutgoingParties(stream, addr)) return false;
  return normalizeSuiAddress(stream.freelancer) === normalizeSuiAddress(addr);
}

export function isStreamOutgoing(s: StreamRecord, addr: string): boolean {
  return isStreamOutgoingParties(s, addr);
}

export function isStreamIncoming(s: StreamRecord, addr: string): boolean {
  return isStreamIncomingParties(s, addr);
}

/** USDC already settled on-chain for this stream (base units). */
export function paidBase(s: StreamRecord): number {
  return s.total - s.remaining;
}

/** Payout cap for a 0-based milestone index (equal-split streams). */
export function milestoneCeilingBase(
  s: StreamRecord,
  milestoneIndex: number
): number {
  if (s.n_milestones <= 0) return s.total;
  return Math.ceil(((milestoneIndex + 1) * s.total) / s.n_milestones);
}

/** Whether the current milestone's allocation has fully dripped on-chain. */
export function milestoneFullyPaid(s: StreamRecord): boolean {
  return paidBase(s) >= milestoneCeilingBase(s, s.current_milestone);
}

/** Base units emitted per millisecond while the stream is active. */
export function streamRatePerMs(s: StreamRecord): number {
  if (s.duration_ms <= 0) return 0;
  return s.total / s.duration_ms;
}

/** Incoming drip rate for a single dripping stream (base units / minute). */
export function dripRatePerMinuteBase(s: StreamRecord): number {
  if (effectiveState(s) !== "dripping") return 0;
  return streamRatePerMs(s) * 60_000;
}

/** Earned base units = already paid + live accrual since the last on-chain drip. */
export function earnedBase(s: StreamRecord, nowMs: number): number {
  const paid = paidBase(s);
  if (effectiveState(s) !== "dripping" || s.duration_ms <= 0) return paid;
  const accrued = Math.max(0, (nowMs - s.last_drip_ms) * streamRatePerMs(s));
  return Math.min(
    paid + accrued,
    milestoneCeilingBase(s, s.current_milestone),
    s.total
  );
}

/** Accrued but not yet settled on-chain (the “live” portion of a dripping stream). */
export function pendingAccrualBase(s: StreamRecord, nowMs: number): number {
  return Math.max(0, earnedBase(s, nowMs) - paidBase(s));
}

/** Outflow rate while dripping (base units / second). */
export function outflowPerSecBase(s: StreamRecord): number {
  if (effectiveState(s) !== "dripping") return 0;
  return streamRatePerMs(s) * 1000;
}

/** Remaining balance including live outflow accrual (sender / outgoing view). */
export function liveRemainingBase(s: StreamRecord, nowMs: number): number {
  return Math.max(0, s.remaining - pendingAccrualBase(s, nowMs));
}

/** Illustrative yield on the locked reserve (~5% APR, UI only). */
export function estimateReserveYieldBase(
  remaining: number,
  nowMs: number,
  sinceMs: number
): number {
  const elapsedSec = Math.max(0, (nowMs - sinceMs) / 1000);
  return remaining * 0.05 * (elapsedSec / (365 * 24 * 3600));
}

/**
 * UI-facing state. The indexer can lag after a milestone completes (the contract
 * flips to LOCKED inside the same `drip` tx with no extra event).
 */
export function effectiveState(s: StreamRecord): StreamState {
  if (s.state === "dripping" && milestoneFullyPaid(s)) return "locked";
  return s.state;
}

/** Number of milestones fully paid out. */
export function completedMilestones(s: StreamRecord): number {
  if (effectiveState(s) === "locked" && s.state === "dripping") {
    return s.current_milestone + 1;
  }
  return s.current_milestone;
}

/** 1-based milestone the freelancer should raise next. */
export function nextMilestoneNo(s: StreamRecord): number {
  if (effectiveState(s) === "locked" && s.state === "dripping") {
    return s.current_milestone + 2;
  }
  return s.current_milestone + 1;
}

/** Client must approve before dripping resumes. */
export function isAwaitingClientApproval(s: StreamRecord): boolean {
  return s.state === "pending_review";
}

/** Freelancer must call raise_completion before the client sees anything. */
export function isAwaitingFreelancerRaise(s: StreamRecord): boolean {
  return effectiveState(s) === "locked";
}

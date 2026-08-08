export type ProWorkerStatus = "dripping" | "paused" | "pending" | "stopped";
export type ProCadence = "MONTHLY" | "HOURLY";
export type ProPoolBucket = "idle" | "yield_vault" | "reserve";
export type ProActivityKind =
  | "funded"
  | "topup"
  | "invested"
  | "rebalanced"
  | "paused"
  | "resumed"
  | "stopped"
  | "claimed"
  | "withdrawn"
  | "worker_added";

export type ProStreamGroup = {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
};

export type ProHireMode = "private" | "public";

export type ProWorker = {
  id: string;
  alias: string;
  walletAddress: string;
  groupId: string | null;
  /** Monthly USDC compensation (display + rate source). */
  monthlyUsd: number;
  cadence: ProCadence;
  /** Allocated runway capital for this substream. */
  budget: number;
  /** Accrued + claimed so far (for live math). */
  streamedUsd: number;
  status: ProWorkerStatus;
  startedAt?: number;
  pausedAt?: number;
  totalPausedMs?: number;
  /** On-chain stream id once funded from treasury (public hire). */
  streamId?: string;
  /** Default private engagement hire; public = treasury Stream. */
  hireMode?: ProHireMode;
  /** Shielded receive address (sl1…) for private hire. */
  shieldedAddress?: string;
  /** Private engagement object id once opened. */
  engagementId?: string;
};

/** Seal ciphertext for the worker roster (persisted; workers stay in memory). */
export type WorkersSealed = {
  v: 1;
  ciphertextB64: string;
  sealNamespace: string;
};

/** Map an indexer stream `state` onto a worker status for the reconciled view. */
export function streamStateToWorkerStatus(
  state: string
): ProWorkerStatus {
  switch (state) {
    case "dripping":
      return "dripping";
    case "paused":
    case "suspended":
      return "paused";
    case "done":
      return "stopped";
    default:
      return "pending"; // locked / pending_review
  }
}

export type ProPoolAllocation = Record<ProPoolBucket, number>;

export type ProFundingPool = {
  token: "USDC";
  funded: number;
  streamed: number;
  allocation: ProPoolAllocation;
  /** Weeks of committed payroll that must stay as liquid idle. */
  coverageWeeks: number;
};

export type ProActivity = {
  id: string;
  kind: ProActivityKind;
  label: string;
  amount?: number;
  at: number;
  digest?: string;
};

export type ProWorkspace = {
  /** 4 = Seal-sealed workers at rest; 3 = legacy cleartext workers. */
  version: 3 | 4;
  orgName: string;
  groups: ProStreamGroup[];
  workers: ProWorker[];
  pool: ProFundingPool;
  activity: ProActivity[];
  /** Simulated yield accrued on invested float. */
  yieldEarned: number;
  updatedAt: number;
  /** On-chain org treasury (Pro pool) once opened. */
  treasuryId?: string;
  /** Net USDC principal moved into the yield vault (to derive real accrued yield). */
  investedPrincipal?: number;
  /** Seal blob for workers — present on v4; workers[] empty until unlock. */
  workersSealed?: WorkersSealed | null;
  /**
   * Ephemeral: true when sealed workers exist but are not decrypted yet.
   * Not written to localStorage.
   */
  rosterLocked?: boolean;
};

/** Legacy demo shape (v1 localStorage). */
export type LegacyProSubstream = {
  id: string;
  name: string;
  budget: number;
  dripPerSec: number;
  status: "dripping" | "paused" | "pending";
};

export type LegacyProStreamGroup = {
  id: string;
  name: string;
  description?: string;
  substreams: LegacyProSubstream[];
  createdAt: number;
};

export const EMPTY_ALLOCATION: ProPoolAllocation = {
  idle: 0,
  yield_vault: 0,
  reserve: 0,
};

// Matches the on-chain yield vault's apr_bps (800 = 8%). Projections and the
// interpolated yield tick use this, so it must track the real vault rate.
export const YIELD_APY = 0.08;

export function newId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Monthly USD → continuous drip $/sec. */
export function monthlyToPerSec(monthlyUsd: number) {
  return monthlyUsd / (30 * 24 * 3600);
}

export function groupCommitted(workspace: ProWorkspace, groupId: string) {
  return workspace.workers
    .filter((w) => w.groupId === groupId)
    .reduce((sum, w) => sum + w.monthlyUsd, 0);
}

export function workspaceMonthlyCommitted(workspace: ProWorkspace) {
  return workspace.workers
    .filter((w) => w.status === "dripping" || w.status === "paused")
    .reduce((sum, w) => sum + w.monthlyUsd, 0);
}

export function workspaceActiveCount(workspace: ProWorkspace) {
  return workspace.workers.filter((w) => w.status === "dripping").length;
}

export function poolTotal(pool: ProFundingPool) {
  return (
    pool.allocation.idle +
    pool.allocation.yield_vault +
    pool.allocation.reserve
  );
}

export function weeklyCommitted(workspace: ProWorkspace) {
  return workspaceMonthlyCommitted(workspace) / 4.345;
}

export function coverageFloor(workspace: ProWorkspace) {
  return weeklyCommitted(workspace) * workspace.pool.coverageWeeks;
}

export function investableIdle(workspace: ProWorkspace) {
  return Math.max(0, workspace.pool.allocation.idle - coverageFloor(workspace));
}

/** Accrued unpaid since start (client-side stand-in until chain). */
export function workerClaimable(worker: ProWorker, nowMs: number) {
  if (worker.status === "pending") return 0;
  const end =
    worker.status === "paused" || worker.status === "stopped"
      ? worker.pausedAt ?? nowMs
      : nowMs;
  const start = worker.startedAt ?? nowMs;
  if (end <= start) return 0;
  const paused = worker.totalPausedMs ?? 0;
  const accrued = monthlyToPerSec(worker.monthlyUsd) * ((end - start - paused) / 1000);
  return Math.max(0, accrued - worker.streamedUsd);
}

export function fmtUsd(n: number, decimals = 2) {
  const abs = Math.abs(n);
  const digits = abs >= 1000 && decimals > 0 ? Math.min(decimals, 0) : decimals;
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function statusLabel(status: ProWorkerStatus) {
  switch (status) {
    case "dripping":
      return "Streaming";
    case "paused":
      return "Paused";
    case "stopped":
      return "Stopped";
    case "pending":
      return "Pending";
  }
}

export function bucketLabel(bucket: ProPoolBucket) {
  switch (bucket) {
    case "idle":
      return "Liquid";
    case "yield_vault":
      return "Yield vault";
    case "reserve":
      return "Reserve";
  }
}

/** Projected monthly yield from vault principal at YIELD_APY. */
export function monthlyYieldFromVault(vaultUsd: number) {
  return vaultUsd * (YIELD_APY / 12);
}

export type MonthlyRunPoint = {
  key: string;
  label: string;
  /** Payroll cost for the month. */
  payroll: number;
  /** Yield expected / earned that month (not capped). */
  yieldUsd: number;
  /** Yield as share of payroll (e.g. 6.8). */
  coverPct: number;
  isCurrent: boolean;
};

/** Average yield-cover % across a monthly run series. */
export function averageCoverPct(points: MonthlyRunPoint[]) {
  if (points.length === 0) return 0;
  const sum = points.reduce((s, p) => s + p.coverPct, 0);
  return Math.round((sum / points.length) * 10) / 10;
}

/**
 * Forward projection of payroll vs. yield, starting this month. Uses the real
 * current monthly payroll and the real projected yield on the actual vault
 * principal at YIELD_APY — no fabricated history. Held flat forward (constant
 * rate), so every month reflects today's real cover ratio rather than invented
 * month-to-month variance. (Testnet has no multi-month history to draw from.)
 */
export function buildMonthlyRun(
  monthlyPayroll: number,
  vaultUsd: number,
  _yieldEarned: number,
  months = 9,
  now = new Date()
): MonthlyRunPoint[] {
  const payroll = Math.max(0, monthlyPayroll);
  const monthlyYield = monthlyYieldFromVault(vaultUsd);
  const coverPct = payroll > 0 ? (monthlyYield / payroll) * 100 : 0;

  const points: MonthlyRunPoint[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    points.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString(undefined, { month: "short" }),
      payroll,
      yieldUsd: monthlyYield,
      coverPct,
      isCurrent: i === 0,
    });
  }
  return points;
}

import {
  EMPTY_ALLOCATION,
  monthlyToPerSec,
  newId,
  type ProActivity,
  type ProWorker,
  type ProWorkspace,
  type WorkersSealed,
} from "@/components/app/pro/types";

const KEY_PREFIX = "sl-pro-workspace";

function storageKey(address: string) {
  return `${KEY_PREFIX}:${address.toLowerCase()}`;
}

/** Disk shape — cleartext workers for demo UX (Seal lock optional / unused). */
type PersistedWorkspace = Omit<
  ProWorkspace,
  "workers" | "rosterLocked" | "workersSealed"
> & {
  version: 3 | 4;
  workers?: ProWorker[];
  workersSealed?: WorkersSealed | null;
};

export function emptyWorkspace(orgName = "My organization"): ProWorkspace {
  return {
    version: 4,
    orgName,
    groups: [],
    workers: [],
    pool: {
      token: "USDC",
      funded: 0,
      streamed: 0,
      allocation: { ...EMPTY_ALLOCATION },
      coverageWeeks: 2,
    },
    activity: [],
    yieldEarned: 0,
    updatedAt: Date.now(),
    workersSealed: null,
    rosterLocked: false,
  };
}

export function loadProWorkspace(address: string): ProWorkspace {
  if (typeof window === "undefined" || !address) return emptyWorkspace();
  try {
    const raw = localStorage.getItem(storageKey(address));
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedWorkspace;

      if (parsed?.version === 4) {
        // Demo: always unlocked. Prefer cleartext workers; ignore Seal lock gate.
        const sealed = parsed.workersSealed ?? null;
        return {
          version: 4,
          orgName: parsed.orgName || "My organization",
          groups: parsed.groups ?? [],
          workers: parsed.workers ?? [],
          pool: parsed.pool ?? emptyWorkspace().pool,
          activity: parsed.activity ?? [],
          yieldEarned: parsed.yieldEarned ?? 0,
          updatedAt: parsed.updatedAt ?? Date.now(),
          treasuryId: parsed.treasuryId,
          investedPrincipal: parsed.investedPrincipal,
          workersSealed: sealed,
          rosterLocked: false,
        };
      }

      if (parsed?.version === 3) {
        // Legacy cleartext roster — load into memory; next sealed save migrates to v4.
        return {
          version: 3,
          orgName: parsed.orgName || "My organization",
          groups: parsed.groups ?? [],
          workers: parsed.workers ?? [],
          pool: parsed.pool ?? emptyWorkspace().pool,
          activity: parsed.activity ?? [],
          yieldEarned: parsed.yieldEarned ?? 0,
          updatedAt: parsed.updatedAt ?? Date.now(),
          treasuryId: parsed.treasuryId,
          investedPrincipal: parsed.investedPrincipal,
          workersSealed: null,
          rosterLocked: false,
        };
      }

      // Older workspace (v2/legacy migrations): drop the accumulated local
      // roster — test/mock people that were never real on-chain streams — but
      // keep the real on-chain treasury link + org name so funds aren't orphaned.
      if ((parsed?.version as number) === 2) {
        const cleaned: ProWorkspace = {
          ...emptyWorkspace(parsed.orgName),
          treasuryId: parsed.treasuryId,
        };
        saveProWorkspace(address, cleaned);
        return cleaned;
      }
    }
  } catch {
    /* fall through */
  }
  return emptyWorkspace();
}

/**
 * Persist workspace. Demo path keeps workers cleartext so People/Streams
 * work without a Seal unlock session.
 */
export function saveProWorkspace(address: string, workspace: ProWorkspace) {
  if (typeof window === "undefined" || !address) return;
  const disk: PersistedWorkspace = {
    version: 3,
    orgName: workspace.orgName,
    groups: workspace.groups,
    pool: workspace.pool,
    activity: workspace.activity,
    yieldEarned: workspace.yieldEarned,
    updatedAt: Date.now(),
    treasuryId: workspace.treasuryId,
    investedPrincipal: workspace.investedPrincipal,
    workers: workspace.workers,
    workersSealed: null,
  };
  localStorage.setItem(storageKey(address), JSON.stringify(disk));
}

export function pushActivity(
  workspace: ProWorkspace,
  entry: Omit<ProActivity, "id" | "at"> & { at?: number }
): ProWorkspace {
  const activity: ProActivity = {
    id: newId("act"),
    at: entry.at ?? Date.now(),
    kind: entry.kind,
    label: entry.label,
    amount: entry.amount,
    digest: entry.digest ?? `0xstub${Math.random().toString(16).slice(2, 10)}`,
  };
  return {
    ...workspace,
    activity: [activity, ...workspace.activity].slice(0, 40),
  };
}

export function dripPerSecFor(worker: ProWorker) {
  return monthlyToPerSec(worker.monthlyUsd);
}

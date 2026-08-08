"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  useCurrentAccount,
  useSignPersonalMessage,
  useSuiClient,
  useSuiClientContext,
} from "@mysten/dapp-kit";
import type { Transaction } from "@mysten/sui/transactions";

import {
  loadProWorkspace,
  pushActivity,
  saveProWorkspace,
  emptyWorkspace,
} from "@/lib/pro-workspace-store";
import { decryptWorkers } from "@/lib/pro-roster-seal";
import { loadOrCreateSessionKey } from "@/lib/seal";
import { useStreams } from "@/lib/indexer";
import { useGaslessExecute } from "@/lib/use-gasless";
import { useNetworkVariable } from "@/lib/networks";
import {
  buildCreateStreamFromTreasuryV2,
  buildOpenTreasury,
  buildTreasuryDeposit,
  buildTreasuryWithdraw,
  buildTreasuryDivestWithdraw,
  buildTreasuryDivest,
  buildTreasuryToReserve,
  buildTreasuryFromReserve,
  buildReserveToYield,
  buildYieldToReserve,
  buildTreasuryInvest,
  buildSuspendPayroll,
  buildResumePayroll,
  buildStopPayroll,
  buildStartPayroll,
  buildCancel,
  buildCancelToTreasury,
  DEFAULT_STREAM_YIELD_BPS,
} from "@/lib/streamline-tx";
import {
  findCreatedTreasury,
  findCreatedStream,
  readStreamTreasuryId,
  useTreasuryState,
} from "@/lib/treasury";
import {
  prepareOpenEngagement,
  prepareSettleVested,
  buildPauseEngagement,
  buildResumeEngagement,
  findCreatedEngagement,
} from "@/lib/private-stream";
import { proveSplitAfterDeposit } from "@/lib/overfund-split";
import { buildSpend } from "@/lib/shielded";
import { getSpendKey, addNote, markSpent } from "@/lib/shielded-store";
import {
  addEngagement,
  loadEngagements,
  updateEngagement,
} from "@/lib/private-engagement-store";
import {
  usePrivacyRelayer,
  relaySubmit,
} from "@/lib/privacy-relayer";
import { SHIELDED_POOL, type NetworkName } from "@/lib/constants";
import { USDC_BASE, toBaseUnits } from "@/lib/stream-math";
import { onProAction } from "./pro-actions";
import {
  EMPTY_ALLOCATION,
  YIELD_APY,
  coverageFloor,
  investableIdle,
  newId,
  poolTotal,
  streamStateToWorkerStatus,
  type ProCadence,
  type ProHireMode,
  type ProPoolBucket,
  type ProStreamGroup,
  type ProWorker,
  type ProWorkerStatus,
  type ProWorkspace,
  workerClaimable,
  workspaceMonthlyCommitted,
} from "./types";

/** Runway a worker's locked stream should cover, by pay cadence. */
// ponytail: fixed runway per cadence; make per-worker configurable if needed.
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const CADENCE_DURATION_MS: Record<ProCadence, number> = {
  MONTHLY: MONTH_MS,
  HOURLY: 7 * 24 * 60 * 60 * 1000,
};

type ModalKind =
  | null
  | "fund"
  | "withdraw"
  | "invest"
  | "worker"
  | "group"
  | { kind: "worker-edit"; workerId: string }
  | { kind: "group-edit"; groupId: string };

type ProWorkspaceContextValue = {
  address: string;
  /** True when browsing seeded sample payroll without a wallet. */
  isDemo: boolean;
  workspace: ProWorkspace;
  hydrated: boolean;
  tick: number;
  nowMs: number;
  modal: ModalKind;
  setModal: (m: ModalKind) => void;
  setOrgName: (name: string) => void;
  upsertGroup: (input: {
    id?: string;
    name: string;
    description?: string;
  }) => void;
  deleteGroup: (groupId: string) => void;
  upsertWorker: (input: {
    id?: string;
    alias: string;
    walletAddress: string;
    groupId: string | null;
    monthlyUsd: number;
    cadence: ProCadence;
    budget?: number;
    status?: ProWorkerStatus;
    hireMode?: ProHireMode;
    shieldedAddress?: string;
  }) => void;
  deleteWorker: (workerId: string) => void;
  setWorkerStatus: (workerId: string, status: ProWorkerStatus) => Promise<boolean>;
  /** Lock the worker's budget and open private engagement or public treasury stream. */
  createWorkerStream: (workerId: string) => Promise<boolean>;
  /** Pay the vested slice of a private engagement to the worker (settle_vested). */
  settleVested: (workerId: string) => Promise<boolean>;
  /** Decrypt Seal-sealed roster (org wallet personal message). */
  unlockRoster: () => Promise<boolean>;
  rosterUnlocking: boolean;
  /** Approve a review-ready stream on-chain so it starts dripping (Start). */
  approveStream: (streamId: string) => Promise<boolean>;
  /** Cancel a treasury stream on-chain, refunding the remainder to the pool (Delete). */
  cancelStream: (streamId: string) => Promise<boolean>;
  /** Deposit USDC into the on-chain treasury (opens one on first use). */
  fundTreasury: (amount: number) => Promise<boolean>;
  /** Withdraw idle float from the on-chain treasury. */
  withdrawTreasury: (amount: number) => Promise<boolean>;
  /** Move idle float into the yield vault on-chain. */
  investTreasury: (amount: number) => Promise<boolean>;
  /** Redeem the whole yield-vault position back to liquid on-chain. */
  divestTreasury: () => Promise<boolean>;
  /** Real on-chain reserve legs of Rebalance (any leg touching `reserve`). */
  rebalanceReserve: (
    from: ProPoolBucket,
    to: ProPoolBucket,
    amount: number
  ) => Promise<boolean>;
  /** True while a treasury/stream tx is in flight. */
  creating: boolean;
  withdrawExcess: (amount: number) => void;
  rebalance: (from: ProPoolBucket, to: ProPoolBucket, amount: number) => void;
  resetDemo: () => void;
  totals: {
    poolBalance: number;
    monthly: number;
    active: number;
    claimable: number;
    yieldEarned: number;
    displayTotal: number;
    investable: number;
    withdrawable: number;
    floor: number;
  };
};

const ProWorkspaceContext = createContext<ProWorkspaceContextValue | null>(null);

/** Find the StreamCap the caller owns for a given stream — needed to approve
 *  or cancel it on-chain. StreamCap type is pinned to the original package. */
async function findStreamCap(
  client: ReturnType<typeof useSuiClient>,
  owner: string,
  originalPackageId: string,
  streamId: string
): Promise<string | null> {
  if (!owner || !originalPackageId || originalPackageId === "0x0") return null;
  let cursor: string | null | undefined = undefined;
  for (let page = 0; page < 5; page++) {
    const res = await client.getOwnedObjects({
      owner,
      filter: { StructType: `${originalPackageId}::stream::StreamCap` },
      options: { showContent: true },
      cursor,
    });
    for (const o of res.data) {
      const c = o.data?.content;
      if (c?.dataType !== "moveObject") continue;
      if ((c.fields as Record<string, unknown>).stream_id === streamId) {
        return o.data?.objectId ?? null;
      }
    }
    if (!res.hasNextPage) break;
    cursor = res.nextCursor;
  }
  return null;
}

export function ProWorkspaceProvider({
  children,
  demo = false,
}: {
  children: ReactNode;
  /** Explore-demo mode: seeded sample payroll, no wallet required. */
  demo?: boolean;
}) {
  const account = useCurrentAccount();
  const address = account?.address ?? "";
  const isDemo = demo && !address;
  const [workspace, setWorkspace] = useState<ProWorkspace>(() =>
    isDemo
      ? emptyWorkspace()
      : {
          version: 3,
          orgName: "",
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
          updatedAt: 0,
        }
  );
  const [hydrated, setHydrated] = useState(false);
  const [tick, setTick] = useState(0);
  const [modal, setModal] = useState<ModalKind>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [rosterUnlocking, setRosterUnlocking] = useState(false);

  // Real on-chain streams this org created, from the indexer. Poll keeps the
  // reconciled view (streamed/status/pool) fresh as the keeper drips.
  const { data: chainStreams } = useStreams({ sender: address });
  const packageId = useNetworkVariable("packageId");
  const usdcType = useNetworkVariable("usdcType");
  const yieldVaultId = useNetworkVariable("yieldVaultId");
  const originalPackageId = useNetworkVariable("originalPackageId");
  const suiClient = useSuiClient();
  const { network } = useSuiClientContext();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const { execute, isPending: creating } = useGaslessExecute();
  const { data: relayer } = usePrivacyRelayer();
  const relayOn = !!relayer?.enabled && !!relayer.address;
  const poolId = SHIELDED_POOL[(network as NetworkName) ?? "testnet"];

  // Live treasury (Pro pool) state — real idle + invested USDC on-chain.
  const { data: treasury, dataUpdatedAt: treasuryUpdatedAt } = useTreasuryState(suiClient, {
    packageId,
    usdcType,
    treasuryId: isDemo ? undefined : workspace.treasuryId,
    vaultId: yieldVaultId,
    sender: address,
  });

  useEffect(() => {
    if (isDemo) {
      setWorkspace(emptyWorkspace());
      setHydrated(true);
      return;
    }
    if (!address) {
      setHydrated(true);
      return;
    }
    // Real login: persisted workspace or empty — never auto-seed mock payroll.
    // Force unlocked so People / Streams work without Seal.
    const loaded = loadProWorkspace(address);
    setWorkspace({
      ...loaded,
      rosterLocked: false,
      workersSealed: null,
    });
    setHydrated(true);
  }, [address, isDemo]);

  // Demo: roster stays unlocked — persist cleartext workers (no Seal gate).
  useEffect(() => {
    if (!hydrated || !address || isDemo) return;
    saveProWorkspace(address, {
      ...workspace,
      rosterLocked: false,
      workersSealed: null,
    });
  }, [workspace, address, hydrated, isDemo]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((t) => t + 1);
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    return onProAction((action) => {
      if (action === "fund") setModal("fund");
      else if (action === "withdraw") setModal("withdraw");
      else if (action === "invest" || action === "analytics") setModal("invest");
    });
  }, []);

  // Accrue simulated yield on vault allocation each second — demo / pre-treasury only.
  useEffect(() => {
    if (!hydrated || workspace.treasuryId) return;
    if (!isDemo && !address) return;
    const vault = workspace.pool.allocation.yield_vault;
    if (vault <= 0) return;
    const perSec = vault * (YIELD_APY / 365 / 24 / 3600);
    setWorkspace((prev) => ({
      ...prev,
      yieldEarned: prev.yieldEarned + perSec,
    }));
    // Only tick-driven; intentionally omit workspace from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, hydrated, address, isDemo]);

  const mutate = useCallback((fn: (prev: ProWorkspace) => ProWorkspace) => {
    setWorkspace((prev) => fn(prev));
  }, []);

  const setOrgName = useCallback(
    (name: string) => mutate((prev) => ({ ...prev, orgName: name })),
    [mutate]
  );

  const upsertGroup = useCallback(
    (input: { id?: string; name: string; description?: string }) => {
      mutate((prev) => {
        if (input.id) {
          return {
            ...prev,
            groups: prev.groups.map((g) =>
              g.id === input.id
                ? { ...g, name: input.name, description: input.description }
                : g
            ),
          };
        }
        const group: ProStreamGroup = {
          id: newId("grp"),
          name: input.name,
          description: input.description,
          createdAt: Date.now(),
        };
        return { ...prev, groups: [...prev.groups, group] };
      });
    },
    [mutate]
  );

  const deleteGroup = useCallback(
    (groupId: string) => {
      mutate((prev) => ({
        ...prev,
        groups: prev.groups.filter((g) => g.id !== groupId),
        workers: prev.workers.map((w) =>
          w.groupId === groupId ? { ...w, groupId: null } : w
        ),
      }));
    },
    [mutate]
  );

  const upsertWorker = useCallback(
    (input: {
      id?: string;
      alias: string;
      walletAddress: string;
      groupId: string | null;
      monthlyUsd: number;
      cadence: ProCadence;
      budget?: number;
      status?: ProWorkerStatus;
      hireMode?: ProHireMode;
      shieldedAddress?: string;
    }) => {
      mutate((prev) => {
        const hireMode = input.hireMode ?? "private";
        if (input.id) {
          return {
            ...prev,
            workers: prev.workers.map((w) =>
              w.id === input.id
                ? {
                    ...w,
                    alias: input.alias,
                    walletAddress: input.walletAddress,
                    groupId: input.groupId,
                    monthlyUsd: input.monthlyUsd,
                    cadence: input.cadence,
                    budget: input.budget ?? w.budget,
                    status: input.status ?? w.status,
                    hireMode,
                    shieldedAddress:
                      input.shieldedAddress ?? w.shieldedAddress,
                  }
                : w
            ),
          };
        }
        const worker: ProWorker = {
          id: newId("w"),
          alias: input.alias,
          walletAddress: input.walletAddress,
          groupId: input.groupId,
          monthlyUsd: input.monthlyUsd,
          cadence: input.cadence,
          budget: input.budget ?? 0,
          streamedUsd: 0,
          status: input.status ?? "pending",
          hireMode,
          shieldedAddress: input.shieldedAddress,
        };
        return pushActivity(
          { ...prev, workers: [...prev.workers, worker] },
          { kind: "worker_added", label: `Added ${input.alias} to roster` }
        );
      });
    },
    [mutate]
  );

  const unlockRoster = useCallback(async (): Promise<boolean> => {
    if (!address || isDemo) return false;
    const sealed = workspace.workersSealed;
    if (!sealed?.ciphertextB64) {
      mutate((prev) => ({ ...prev, rosterLocked: false }));
      return true;
    }
    if (!packageId || packageId === "0x0" || !originalPackageId) return false;
    setRosterUnlocking(true);
    try {
      const session = await loadOrCreateSessionKey({
        suiClient,
        address,
        network: (network as NetworkName) ?? "testnet",
        sealNamespace: sealed.sealNamespace || originalPackageId,
        signPersonalMessage: (message) => signPersonalMessage({ message }),
      });
      const workers = await decryptWorkers({
        suiClient,
        packageId,
        sessionKey: session,
        orgAddress: address,
        sealed,
      });
      mutate((prev) => ({
        ...prev,
        version: 4,
        workers,
        rosterLocked: false,
        workersSealed: sealed,
      }));
      return true;
    } catch (e) {
      window.alert(
        `Couldn't unlock roster: ${e instanceof Error ? e.message : String(e)}`
      );
      return false;
    } finally {
      setRosterUnlocking(false);
    }
  }, [
    address,
    isDemo,
    workspace.workersSealed,
    packageId,
    originalPackageId,
    suiClient,
    network,
    signPersonalMessage,
    mutate,
  ]);

  const deleteWorker = useCallback(
    (workerId: string) => {
      mutate((prev) => ({
        ...prev,
        workers: prev.workers.filter((w) => w.id !== workerId),
      }));
    },
    [mutate]
  );

  // Pay the vested slice of a private engagement to the worker (real
  // `private_stream::settle_vested`). Publishes the worker's encrypted note so
  // they can "Scan for incoming" and claim; rolls the employer's funding note
  // forward to the change note. This is the real private payment leg.
  const settleVested = useCallback(
    async (workerId: string): Promise<boolean> => {
      const worker = workspace.workers.find((w) => w.id === workerId);
      if (!worker || !worker.engagementId) return false;
      if (!address || !packageId || packageId === "0x0") return false;
      if (!poolId || poolId === "0x0") {
        window.alert("Shielded pool not configured on this network.");
        return false;
      }
      const eng = loadEngagements(address).find(
        (e) => e.engagementId === worker.engagementId
      );
      if (!eng) {
        window.alert(
          `No local engagement opening for ${worker.alias} in this browser — settle must run where the hire was opened.`
        );
        return false;
      }
      if (!eng.workerShielded?.startsWith("sl1")) {
        window.alert(
          `${worker.alias} has no private (sl1) pay-to address, so there's no one to settle to. Re-hire with an sl1 recipient.`
        );
        return false;
      }
      try {
        const prepared = await prepareSettleVested({
          packageId,
          coinType: eng.coinType,
          poolId,
          engagementId: eng.engagementId,
          client: suiClient,
          sk: getSpendKey(address),
          rhoIn: BigInt(eng.fundingRho),
          valueIn: BigInt(eng.fundingValue),
          rate: BigInt(eng.rate),
          start: BigInt(eng.start),
          cap: BigInt(eng.cap),
          rParams: BigInt(eng.rParams),
          paramsCommitment: BigInt(eng.paramsCommitment),
          payBase: BigInt(eng.cap), // pay everything vested so far; clamped internally
          workerShielded: eng.workerShielded,
        });

        let ok = false;
        let settleErr: Error | null = null;
        await execute(prepared.tx, {
          onSuccess: () => {
            ok = true;
          },
          onError: (e) => {
            settleErr = e;
          },
        });
        if (settleErr) throw settleErr;
        if (!ok) return false;

        // Employer's funding note is now the change note (cm2 / rho2, value v2).
        markSpent(address, eng.fundingCm);
        if (prepared.v2 > 0n) {
          addNote(address, {
            commitment: prepared.cm2.toString(),
            value: prepared.v2.toString(),
            rho: prepared.rho2.toString(),
            spent: false,
            createdAt: Date.now(),
          });
        }
        updateEngagement(address, eng.engagementId, {
          fundingCm: prepared.cm2.toString(),
          fundingRho: prepared.rho2.toString(),
          fundingValue: prepared.v2.toString(),
        });

        const paidUsd = Number(prepared.v1) / Number(USDC_BASE);
        mutate((prev) =>
          pushActivity(
            {
              ...prev,
              workers: prev.workers.map((w) =>
                w.id === workerId
                  ? {
                      ...w,
                      status: "dripping" as const,
                      startedAt: w.startedAt ?? Date.now(),
                    }
                  : w
              ),
            },
            {
              kind: "resumed",
              label: `Paid ${worker.alias} $${paidUsd.toFixed(2)} vested — they can now Scan for incoming`,
              amount: paidUsd,
            }
          )
        );
        return true;
      } catch (e) {
        window.alert(
          `Couldn't settle ${worker.alias}: ${
            e instanceof Error ? e.message : String(e)
          }`
        );
        return false;
      }
    },
    [address, workspace.workers, poolId, packageId, suiClient, execute, mutate]
  );

  const setWorkerStatus = useCallback(
    async (workerId: string, status: ProWorkerStatus): Promise<boolean> => {
      const worker = workspace.workers.find((w) => w.id === workerId);
      if (!worker) return false;

      const isPrivate =
        (worker.hireMode ?? "private") === "private" || !!worker.engagementId;

      // Demo / local-only / private engagement: UI state only (no on-chain HR).
      if (
        isDemo ||
        isPrivate ||
        !worker.streamId ||
        !packageId ||
        packageId === "0x0"
      ) {
        // Real on-chain freeze/resume for pausable (v2) private engagements:
        // pause_engagement / resume_engagement excludes paused time from vesting.
        let onChainHr = false;
        if (isPrivate && !isDemo && worker.engagementId && poolId) {
          const eng = loadEngagements(address).find(
            (e) => e.engagementId === worker.engagementId
          );
          const wasRunning = worker.status === "dripping";
          const wasFrozen =
            worker.status === "paused" || worker.status === "stopped";
          let tx: ReturnType<typeof buildPauseEngagement> | null = null;
          if ((status === "paused" || status === "stopped") && wasRunning) {
            tx = buildPauseEngagement({ packageId, engagementId: worker.engagementId });
          } else if (status === "dripping" && wasFrozen) {
            tx = buildResumeEngagement({ packageId, engagementId: worker.engagementId });
          }
          if (tx && eng?.pausable) {
            let ok = false;
            let hrErr: Error | null = null;
            await execute(tx, {
              onSuccess: () => {
                ok = true;
              },
              onError: (e) => {
                hrErr = e;
              },
            });
            if (hrErr) {
              window.alert(
                `Couldn't ${status === "dripping" ? "resume" : "freeze"} ${
                  worker.alias
                } on-chain: ${(hrErr as Error).message}`
              );
              return false;
            }
            if (!ok) return false;
            onChainHr = true;
          } else if (tx && !eng?.pausable) {
            // Legacy engagement opened before the pause upgrade → local only.
            if (
              !window.confirm(
                `${worker.alias} was hired before on-chain pause existed — this only updates your local roster. Continue?`
              )
            ) {
              return false;
            }
          }
        }
        mutate((prev) => {
          const now = Date.now();
          const nextWorkers = prev.workers.map((w) => {
            if (w.id !== workerId) return w;
            if (status === "paused" || status === "stopped") {
              return { ...w, status, pausedAt: now };
            }
            if (status === "dripping") {
              const pauseSpan =
                w.pausedAt && (w.status === "paused" || w.status === "stopped")
                  ? now - w.pausedAt
                  : 0;
              return {
                ...w,
                status: "dripping" as const,
                pausedAt: undefined,
                startedAt: w.startedAt ?? now,
                totalPausedMs: (w.totalPausedMs ?? 0) + pauseSpan,
              };
            }
            return { ...w, status };
          });
          return pushActivity(
            { ...prev, workers: nextWorkers },
            {
              kind:
                status === "paused"
                  ? "paused"
                  : status === "dripping"
                    ? "resumed"
                    : "stopped",
              label: `${status === "dripping" ? "Resumed" : status === "paused" ? "Paused" : "Stopped"} ${worker.alias}${isPrivate && !onChainHr ? " (local)" : ""}`,
            }
          );
        });
        return true;
      }

      const ref = {
        packageId,
        usdcType,
        streamId: worker.streamId,
      };
      let tx;
      if (status === "paused") {
        tx = buildSuspendPayroll(ref);
      } else if (status === "dripping") {
        tx = buildResumePayroll(ref);
      } else if (status === "stopped") {
        const tid = workspace.treasuryId;
        if (!tid) return false;
        tx = buildStopPayroll({ ...ref, treasuryId: tid });
      } else {
        return false;
      }

      let ok = false;
      await execute(tx, {
        onSuccess: () => {
          ok = true;
          const now = Date.now();
          mutate((prev) => {
            const nextWorkers = prev.workers.map((w) => {
              if (w.id !== workerId) return w;
              if (status === "paused" || status === "stopped") {
                return { ...w, status, pausedAt: now };
              }
              if (status === "dripping") {
                const pauseSpan =
                  w.pausedAt && (w.status === "paused" || w.status === "stopped")
                    ? now - w.pausedAt
                    : 0;
                return {
                  ...w,
                  status: "dripping" as const,
                  pausedAt: undefined,
                  startedAt: w.startedAt ?? now,
                  totalPausedMs: (w.totalPausedMs ?? 0) + pauseSpan,
                };
              }
              return { ...w, status };
            });
            return pushActivity(
              { ...prev, workers: nextWorkers },
              {
                kind:
                  status === "paused"
                    ? "paused"
                    : status === "dripping"
                      ? "resumed"
                      : "stopped",
                label: `${status === "dripping" ? "Resumed" : status === "paused" ? "Paused" : "Stopped"} ${worker.alias}`,
              }
            );
          });
        },
        onError: () => {
          ok = false;
        },
      });
      return ok;
    },
    [
      workspace.workers,
      workspace.treasuryId,
      isDemo,
      packageId,
      usdcType,
      execute,
      mutate,
    ]
  );

  // Ensure the org has an on-chain treasury, opening one on first use.
  const ensureTreasury = useCallback(async (): Promise<string | null> => {
    if (!address) throw new Error("No wallet connected");
    if (!packageId || packageId === "0x0") throw new Error("Package not deployed");
    if (workspace.treasuryId) return workspace.treasuryId;
    const tx = buildOpenTreasury({ packageId, usdcType, sender: address });
    // execute() calls onSuccess synchronously before it resolves, so capture the
    // digest here and resolve the object id AFTER the await — doing it inside the
    // (un-awaited) callback races the return.
    let digest: string | null = null;
    let err: Error | null = null;
    await execute(tx, {
      onSuccess: ({ digest: d }) => {
        digest = d;
      },
      onError: (e) => {
        err = e;
      },
    });
    if (err) throw err;
    if (!digest) throw new Error("Treasury open returned no digest");
    const id = await findCreatedTreasury(suiClient, digest);
    if (!id) throw new Error("Opened treasury but could not read its id");
    mutate((prev) => ({ ...prev, treasuryId: id }));
    return id;
  }, [address, packageId, usdcType, workspace.treasuryId, execute, suiClient, mutate]);

  const createWorkerStream = useCallback(
    async (workerId: string): Promise<boolean> => {
      if (!address) return false;
      const worker = workspace.workers.find((w) => w.id === workerId);
      if (!worker) return false;
      if (worker.streamId || worker.engagementId) return true;
      if (!packageId || packageId === "0x0") return false;
      const budget = worker.budget > 0 ? worker.budget : worker.monthlyUsd;
      if (budget <= 0) return false;

      const hireMode: ProHireMode = worker.hireMode ?? "private";

      // ——— Private engagement (default) ———
      if (hireMode === "private") {
        if (!poolId || poolId === "0x0") {
          window.alert("Shielded pool not configured on this network.");
          return false;
        }
        try {
          const totalBase = toBaseUnits(budget);
          const durationSec = BigInt(
            Math.max(1, Math.floor(CADENCE_DURATION_MS[worker.cadence] / 1000))
          );
          const sk = getSpendKey(address);
          const shielded =
            worker.shieldedAddress?.startsWith("sl1")
              ? worker.shieldedAddress
              : undefined;
          const prepared = await prepareOpenEngagement({
            packageId,
            coinType: usdcType,
            poolId,
            sender: address,
            sk,
            client: suiClient,
            capBase: totalBase,
            durationSec,
            recipientShielded: shielded,
            label: worker.alias || undefined,
          });

          // Funding open is user-signed (Enoki-sponsored gas). The relayer is
          // never asked to fund principal — that path was drainable. Ongoing
          // settles/spends still relay for origin-hiding (proof-only, no funds).
          let openDigest = "";
          let openErr: Error | null = null;
          await execute(prepared.tx, {
            onSuccess: ({ digest }) => {
              openDigest = digest;
            },
            onError: (e) => {
              openErr = e;
            },
          });
          if (openErr) throw openErr;

          let fundingCm = prepared.cm;
          let fundingRho = prepared.rho;
          let fundingValue = totalBase;
          let changeCm: bigint | null = null;
          let changeRho: bigint | null = null;

          if (prepared.changeBase > 0n) {
            const split = await proveSplitAfterDeposit({
              client: suiClient,
              packageId,
              sk,
              pkv: prepared.pkv,
              cmDeposit: prepared.cm,
              rhoDeposit: prepared.rho,
              depositBase: prepared.depositBase,
              desiredBase: totalBase,
            });
            if (relayOn) {
              await relaySubmit({
                network: (network as NetworkName) ?? "testnet",
                kind: "spend",
                packageId,
                coinType: usdcType,
                poolId,
                proof: split.proof,
                root: split.root,
                nf: split.nf,
                cm1: split.cmWork,
                cm2: split.cmChange,
              });
            } else {
              let splitErr: Error | null = null;
              await execute(
                buildSpend({
                  packageId,
                  coinType: usdcType,
                  poolId,
                  root: split.root,
                  nf: split.nf,
                  cm1: split.cmWork,
                  cm2: split.cmChange,
                  proof: split.proof,
                }),
                {
                  onSuccess: () => {},
                  onError: (e) => {
                    splitErr = e;
                  },
                }
              );
              if (splitErr) throw splitErr;
            }
            fundingCm = split.cmWork;
            fundingRho = split.rhoWork;
            changeCm = split.cmChange;
            changeRho = split.rhoChange;
          }

          const engagementId = await findCreatedEngagement(suiClient, openDigest);
          if (!engagementId) throw new Error("Engagement opened but id not found");

          addEngagement(address, {
            engagementId,
            coinType: usdcType,
            poolId,
            fundingCm: fundingCm.toString(),
            fundingRho: fundingRho.toString(),
            fundingValue: fundingValue.toString(),
            rate: prepared.rate.toString(),
            start: prepared.start.toString(),
            cap: totalBase.toString(),
            rParams: prepared.rParams.toString(),
            paramsCommitment: prepared.paramsCommitment.toString(),
            workerShielded: shielded,
            pausable: true, // opened via open_engagement_v2 → on-chain pause
            label: worker.alias,
            createdAt: Date.now(),
          });
          addNote(address, {
            commitment: fundingCm.toString(),
            value: fundingValue.toString(),
            rho: fundingRho.toString(),
            spent: false,
            createdAt: Date.now(),
          });
          if (changeCm && changeRho && prepared.changeBase > 0n) {
            addNote(address, {
              commitment: changeCm.toString(),
              value: prepared.changeBase.toString(),
              rho: changeRho.toString(),
              spent: false,
              createdAt: Date.now(),
            });
          }

          mutate((prev) =>
            pushActivity(
              {
                ...prev,
                workers: prev.workers.map((w) =>
                  w.id === workerId
                    ? {
                        ...w,
                        status: "dripping" as const,
                        startedAt: Date.now(),
                        budget,
                        hireMode: "private",
                        engagementId,
                      }
                    : w
                ),
              },
              {
                kind: "resumed",
                label: `Hired ${worker.alias} privately (shielded pool)`,
                amount: budget,
              }
            )
          );
          return true;
        } catch (e) {
          window.alert(
            `Couldn't start private hire for ${worker.alias}: ${
              e instanceof Error ? e.message : String(e)
            }`
          );
          return false;
        }
      }

      // ——— Public treasury hire ———
      let tid: string | null = null;
      try {
        tid = await ensureTreasury();
      } catch {
        return false;
      }
      if (!tid) return false;

      const totalBase = toBaseUnits(budget);
      const vaultId =
        yieldVaultId && yieldVaultId !== "0x0" ? yieldVaultId : undefined;
      const tx = buildCreateStreamFromTreasuryV2({
        packageId,
        usdcType,
        sender: address,
        freelancer: worker.walletAddress,
        treasuryId: tid,
        vaultId,
        milestoneNames: [`${worker.alias} payroll`],
        milestoneAmountsBase: [totalBase],
        totalBase,
        durationMs: CADENCE_DURATION_MS[worker.cadence],
        yieldBps: DEFAULT_STREAM_YIELD_BPS,
      });

      let ok = false;
      let digest: string | null = null;
      let err: Error | null = null;
      await execute(tx, {
        onSuccess: ({ digest: d }) => {
          ok = true;
          digest = d;
        },
        onError: (e) => {
          err = e;
        },
      });
      if (err) {
        window.alert(
          `Couldn't start ${worker.alias}'s stream: ${(err as Error).message}`
        );
        return false;
      }
      if (!ok) return false;
      const newStreamId = digest
        ? await findCreatedStream(suiClient, digest)
        : null;
      mutate((prev) =>
        pushActivity(
          {
            ...prev,
            workers: prev.workers.map((w) =>
              w.id === workerId
                ? {
                    ...w,
                    status: "dripping" as const,
                    startedAt: Date.now(),
                    budget,
                    hireMode: "public",
                    streamId: newStreamId ?? w.streamId,
                  }
                : w
            ),
          },
          {
            kind: "resumed",
            label: `Hired ${worker.alias} from treasury (public)`,
            amount: budget,
          }
        )
      );
      return true;
    },
    [
      address,
      workspace.workers,
      packageId,
      usdcType,
      yieldVaultId,
      execute,
      mutate,
      ensureTreasury,
      suiClient,
      poolId,
      relayOn,
      relayer,
      network,
    ]
  );

  // Run a treasury tx, mutating on success and throwing the real error on
  // failure (so the modal can show it instead of silently no-op'ing).
  const runTreasuryTx = useCallback(
    async (tx: Transaction, activity: Parameters<typeof pushActivity>[1]) => {
      let err: Error | null = null;
      await execute(tx, {
        onSuccess: () => mutate((prev) => pushActivity(prev, activity)),
        onError: (e) => {
          err = e;
        },
      });
      if (err) throw err;
      return true;
    },
    [execute, mutate]
  );

  const fundTreasury = useCallback(
    async (amount: number): Promise<boolean> => {
      if (amount <= 0) return false;
      const tid = await ensureTreasury();
      return runTreasuryTx(
        buildTreasuryDeposit({
          packageId,
          usdcType,
          sender: address,
          treasuryId: tid!,
          amountBase: toBaseUnits(amount),
        }),
        { kind: "funded", label: "Funded treasury on-chain", amount }
      );
    },
    [ensureTreasury, runTreasuryTx, packageId, usdcType, address]
  );

  const withdrawTreasury = useCallback(
    async (amount: number): Promise<boolean> => {
      if (amount <= 0) return false;
      if (!workspace.treasuryId) throw new Error("No treasury to withdraw from");
      let amountBase = toBaseUnits(amount);
      // Clamp to what divest+withdraw can actually deliver on-chain: idle + the
      // yield vault's redeemable value (invested_value). Guards the interpolated
      // display max from overshooting real idle → EInsufficientIdle.
      if (treasury) {
        const cap = toBaseUnits(treasury.idle + treasury.invested);
        if (amountBase > cap) amountBase = cap;
      }
      // treasury::withdraw only spends idle. If the request exceeds liquid but the
      // rest is in the yield vault, redeem the vault back to idle first (same PTB).
      const needsDivest =
        amountBase > toBaseUnits(treasury?.idle ?? 0) && (treasury?.invested ?? 0) > 0;
      const tx = needsDivest
        ? buildTreasuryDivestWithdraw({
            packageId,
            usdcType,
            sender: address,
            treasuryId: workspace.treasuryId,
            vaultId: yieldVaultId,
            amountBase,
          })
        : buildTreasuryWithdraw({
            packageId,
            usdcType,
            sender: address,
            treasuryId: workspace.treasuryId,
            amountBase,
          });
      return runTreasuryTx(tx, {
        kind: "withdrawn",
        label: "Withdrew from treasury",
        amount,
      });
    },
    [workspace.treasuryId, treasury, yieldVaultId, runTreasuryTx, packageId, usdcType, address]
  );

  const investTreasury = useCallback(
    async (amount: number): Promise<boolean> => {
      if (amount <= 0) return false;
      if (!workspace.treasuryId) throw new Error("Fund the pool first");
      await runTreasuryTx(
        buildTreasuryInvest({
          packageId,
          usdcType,
          sender: address,
          treasuryId: workspace.treasuryId,
          vaultId: yieldVaultId,
          amountBase: toBaseUnits(amount),
        }),
        { kind: "invested", label: "Moved idle into yield vault", amount }
      );
      mutate((prev) => ({
        ...prev,
        investedPrincipal: (prev.investedPrincipal ?? 0) + amount,
      }));
      return true;
    },
    [workspace.treasuryId, runTreasuryTx, packageId, usdcType, address, yieldVaultId, mutate]
  );

  // Redeem the entire yield-vault position back to liquid (the Yield → Liquid
  // leg of Rebalance). treasury::divest is all-or-nothing on-chain.
  const divestTreasury = useCallback(async (): Promise<boolean> => {
    if (!workspace.treasuryId) throw new Error("Nothing invested to divest");
    await runTreasuryTx(
      buildTreasuryDivest({
        packageId,
        usdcType,
        sender: address,
        treasuryId: workspace.treasuryId,
        vaultId: yieldVaultId,
      }),
      { kind: "rebalanced", label: "Redeemed yield vault into liquid", amount: 0 }
    );
    mutate((prev) => ({
      ...prev,
      investedPrincipal: 0,
      pool: {
        ...prev.pool,
        allocation: {
          ...prev.pool.allocation,
          idle: prev.pool.allocation.idle + prev.pool.allocation.yield_vault,
          yield_vault: 0,
        },
      },
    }));
    return true;
  }, [workspace.treasuryId, runTreasuryTx, packageId, usdcType, address, yieldVaultId, mutate]);

  // Reserve legs of Rebalance — all real on-chain now (treasury::to_reserve /
  // from_reserve, plus PTB combos for the yield legs). Liquid↔Reserve are exact
  // amount; a Yield leg rides on divest (all-or-nothing) so it folds the whole
  // vault position back to idle first.
  const rebalanceReserve = useCallback(
    async (
      from: ProPoolBucket,
      to: ProPoolBucket,
      amount: number
    ): Promise<boolean> => {
      if (amount <= 0) return false;
      if (!workspace.treasuryId) throw new Error("Fund the pool first");
      const ref = {
        packageId,
        usdcType,
        sender: address,
        treasuryId: workspace.treasuryId,
      };
      const base = toBaseUnits(amount);
      const vref = { ...ref, vaultId: yieldVaultId };
      const tx =
        from === "idle" && to === "reserve"
          ? buildTreasuryToReserve({ ...ref, amountBase: base })
          : from === "reserve" && to === "idle"
            ? buildTreasuryFromReserve({ ...ref, amountBase: base })
            : from === "reserve" && to === "yield_vault"
              ? buildReserveToYield({ ...vref, amountBase: base })
              : from === "yield_vault" && to === "reserve"
                ? buildYieldToReserve({ ...vref, amountBase: base })
                : null;
      if (!tx) throw new Error("Unsupported reserve leg");
      await runTreasuryTx(tx, {
        kind: "rebalanced",
        label: `Rebalanced ${from} → ${to}`,
        amount,
      });
      mutate((prev) => {
        const alloc = { ...prev.pool.allocation };
        let src = from;
        if (from === "yield_vault") {
          alloc.idle += alloc.yield_vault;
          alloc.yield_vault = 0;
          src = "idle";
        }
        const take = Math.min(amount, alloc[src]);
        alloc[src] -= take;
        alloc[to] += take;
        return { ...prev, pool: { ...prev.pool, allocation: alloc } };
      });
      return true;
    },
    [workspace.treasuryId, packageId, usdcType, address, yieldVaultId, runTreasuryTx, mutate]
  );

  const withdrawExcess = useCallback(
    (amount: number) => {
      mutate((prev) => {
        const floor = coverageFloor(prev);
        const max = Math.max(0, prev.pool.allocation.idle - floor);
        const take = Math.min(amount, max);
        if (take <= 0) return prev;
        const next: ProWorkspace = {
          ...prev,
          pool: {
            ...prev.pool,
            funded: Math.max(0, prev.pool.funded - take),
            allocation: {
              ...prev.pool.allocation,
              idle: prev.pool.allocation.idle - take,
            },
          },
        };
        return pushActivity(next, {
          kind: "withdrawn",
          label: "Withdrew excess above coverage floor",
          amount: take,
        });
      });
    },
    [mutate]
  );

  const rebalance = useCallback(
    (from: ProPoolBucket, to: ProPoolBucket, amount: number) => {
      mutate((prev) => {
        if (from === to) return prev;
        const take = Math.min(amount, prev.pool.allocation[from]);
        if (take <= 0) return prev;
        const next: ProWorkspace = {
          ...prev,
          pool: {
            ...prev.pool,
            allocation: {
              ...prev.pool.allocation,
              [from]: prev.pool.allocation[from] - take,
              [to]: prev.pool.allocation[to] + take,
            },
          },
        };
        return pushActivity(next, {
          kind: "rebalanced",
          label: `Rebalanced ${from} → ${to}`,
          amount: take,
        });
      });
    },
    [mutate]
  );

  // Start a funded stream on-chain via the payer's StreamCap. `start_payroll`
  // moves LOCKED *or* PENDING_REVIEW straight to DRIPPING, so this is the real
  // "Start" for every not-yet-live stream (approve_milestone couldn't touch
  // LOCKED). Surfaces failures so a revert isn't silent.
  const approveStream = useCallback(
    async (streamId: string): Promise<boolean> => {
      if (!address || !packageId || packageId === "0x0") return false;
      const capId = await findStreamCap(suiClient, address, originalPackageId, streamId);
      if (!capId) {
        window.alert(
          "Couldn't find your control cap for this stream — it may belong to a different wallet."
        );
        return false;
      }
      const tx = buildStartPayroll({ packageId, usdcType, streamId, capId });
      let ok = false;
      let err: Error | null = null;
      await execute(tx, {
        onSuccess: () => {
          ok = true;
          mutate((prev) =>
            pushActivity(prev, { kind: "resumed", label: "Started stream" })
          );
        },
        onError: (e) => {
          err = e;
        },
      });
      if (err) window.alert(`Couldn't start the stream: ${(err as Error).message}`);
      return ok;
    },
    [address, packageId, usdcType, originalPackageId, suiClient, execute, mutate]
  );

  // Cancel a treasury-funded stream on-chain: refund the remainder to the pool,
  // close it, consume the cap. The payer's real on-chain "Delete".
  const cancelStream = useCallback(
    async (streamId: string): Promise<boolean> => {
      if (!address || !packageId || packageId === "0x0") return false;
      const capId = await findStreamCap(suiClient, address, originalPackageId, streamId);
      if (!capId) {
        window.alert(
          "Couldn't find your control cap for this stream — it may belong to a different wallet."
        );
        return false;
      }
      // Route by funding source: payroll (treasury-funded) refunds to the pool;
      // a wallet-funded stream refunds to the sender wallet. cancel_to_treasury
      // aborts on a wallet-funded stream, so pick the right entry up front.
      const streamTid = await readStreamTreasuryId(suiClient, {
        packageId,
        usdcType,
        streamId,
        sender: address,
      });
      const tx = streamTid
        ? buildCancelToTreasury({
            packageId,
            usdcType,
            streamId,
            capId,
            treasuryId: streamTid,
          })
        : buildCancel({ packageId, usdcType, streamId, capId });
      let ok = false;
      let err: Error | null = null;
      await execute(tx, {
        onSuccess: () => {
          ok = true;
          mutate((prev) =>
            pushActivity(
              {
                ...prev,
                // Drop the local row too — cancel is terminal, and the folded
                // chain row is already skipped once the stream reads "done".
                workers: prev.workers.filter((w) => w.streamId !== streamId),
              },
              {
                kind: "stopped",
                label: streamTid
                  ? "Canceled stream — refunded to pool"
                  : "Canceled stream — refunded to wallet",
              }
            )
          );
        },
        onError: (e) => {
          err = e;
        },
      });
      if (err) window.alert(`Couldn't cancel the stream: ${(err as Error).message}`);
      return ok;
    },
    [address, packageId, usdcType, originalPackageId, suiClient, execute, mutate]
  );

  const resetDemo = useCallback(() => {
    setWorkspace(emptyWorkspace());
  }, []);

  // Read overlay: fold real on-chain stream state onto the local workspace.
  // Workers bind to their stream by explicit streamId, else by freelancer
  // address. Only real-backed fields (streamed, status, budget, pool.streamed)
  // are overridden — local org metadata (aliases, groups, allocation) is kept.
  // ponytail: matches newest stream per freelancer; parse tx effects for exact
  // streamId if a worker ever needs multiple concurrent streams.
  const workspaceView = useMemo(() => {
    const streams = chainStreams ?? [];
    // Real pool float from the on-chain treasury (idle + invested in the vault).
    const poolOverride = treasury
      ? {
          funded: treasury.idle + treasury.invested + treasury.reserve,
          allocation: {
            ...workspace.pool.allocation,
            idle: treasury.idle,
            yield_vault: treasury.invested,
            reserve: treasury.reserve,
          },
        }
      : null;
    // Real accrued yield = vault position value − principal we put in. The chain
    // is only read every 15s and 3% APR moves sub-cent per second, so interpolate
    // forward from the last read (re-anchors on each refetch) to visibly tick.
    const yieldOverride = treasury
      ? {
          yieldEarned: (() => {
            const onChain = Math.max(
              0,
              treasury.invested - (workspace.investedPrincipal ?? 0)
            );
            const perSec = treasury.invested * (YIELD_APY / 365 / 24 / 3600);
            const dt = Math.max(0, (nowMs - treasuryUpdatedAt) / 1000);
            return onChain + perSec * dt;
          })(),
        }
      : null;
    // A local worker with no bound on-chain stream/engagement must never render
    // as live: downgrade a stale "dripping"/"paused" to "pending".
    const phantomGuard = (w: ProWorker): ProWorker =>
      !w.streamId &&
      !w.engagementId &&
      (w.status === "dripping" || w.status === "paused")
        ? { ...w, status: "pending" }
        : w;

    if (streams.length === 0) {
      const base = { ...workspace, workers: workspace.workers.map(phantomGuard) };
      if (!poolOverride) return base;
      return {
        ...base,
        pool: { ...workspace.pool, ...poolOverride },
        ...yieldOverride,
      };
    }
    // 1) Fold real on-chain state onto local workers, bound *only* by the
    // streamId persisted when the worker was hired. Address matching was removed
    // on purpose: many workers can share a payout wallet and stale/done streams
    // reuse it, so matching by address bound fresh workers to finished streams
    // (showing "stopped", blocking Start) and risked Delete canceling an
    // unrelated stream. A worker with no streamId stays local until hired.
    // Orphan on-chain streams are NOT auto-injected as "Public" roster cards.
    const workers = workspace.workers.map((w) => {
      const s = w.streamId
        ? streams.find((x) => x.id === w.streamId)
        : undefined;
      if (!s) return phantomGuard(w);
      return {
        ...w,
        streamId: s.id,
        budget: s.total / USDC_BASE,
        streamedUsd: (s.total - s.remaining) / USDC_BASE,
        status: streamStateToWorkerStatus(s.state),
      };
    });

    const streamed = workers.reduce(
      (sum, w) => sum + (w.streamId ? w.streamedUsd : 0),
      0
    );
    return {
      ...workspace,
      workers,
      pool: { ...workspace.pool, streamed, ...(poolOverride ?? {}) },
      ...yieldOverride,
    };
  }, [workspace, chainStreams, treasury, nowMs, treasuryUpdatedAt]);

  const totals = useMemo(() => {
    const poolBalance = poolTotal(workspaceView.pool) + workspaceView.yieldEarned;
    const monthly = workspaceMonthlyCommitted(workspaceView);
    const active = workspaceView.workers.filter((w) => w.status === "dripping").length;
    const claimable = workspaceView.workers.reduce(
      (sum, w) => sum + workerClaimable(w, nowMs),
      0
    );
    return {
      poolBalance,
      monthly,
      active,
      claimable,
      yieldEarned: workspaceView.yieldEarned,
      displayTotal: poolBalance,
      investable: investableIdle(workspaceView),
      // Withdrawable = idle now + yield-vault funds after an automatic divest,
      // above the coverage floor. The parked reserve is NOT included — divest
      // only redeems the yield vault, so counting reserve overshoots idle and
      // aborts (EInsufficientIdle). Reserve must be released via Rebalance first.
      withdrawable: Math.max(
        0,
        poolTotal(workspaceView.pool) -
          workspaceView.pool.allocation.reserve -
          coverageFloor(workspaceView)
      ),
      floor: coverageFloor(workspaceView),
    };
  }, [workspaceView, nowMs]);

  const value: ProWorkspaceContextValue = {
    address,
    isDemo,
    workspace: workspaceView,
    hydrated,
    tick,
    nowMs,
    modal,
    setModal,
    setOrgName,
    upsertGroup,
    deleteGroup,
    upsertWorker,
    deleteWorker,
    setWorkerStatus,
    createWorkerStream,
    settleVested,
    unlockRoster,
    rosterUnlocking,
    approveStream,
    cancelStream,
    fundTreasury,
    withdrawTreasury,
    investTreasury,
    divestTreasury,
    rebalanceReserve,
    creating,
    withdrawExcess,
    rebalance,
    resetDemo,
    totals,
  };

  return (
    <ProWorkspaceContext.Provider value={value}>
      {children}
    </ProWorkspaceContext.Provider>
  );
}

export function useProWorkspace() {
  const ctx = useContext(ProWorkspaceContext);
  if (!ctx) {
    throw new Error("useProWorkspace must be used within ProWorkspaceProvider");
  }
  return ctx;
}

import { Transaction, coinWithBalance } from "@mysten/sui/transactions";

/** The shared on-chain Clock object. */
const CLOCK = "0x6";

/** Default review window before a raised milestone auto-approves (48h). */
export const DEFAULT_DISPUTE_WINDOW_MS = 48 * 60 * 60 * 1000;

export type CreateStreamArgs = {
  packageId: string;
  usdcType: string;
  /** Client address — required so `coinWithBalance` can pick the USDC coins. */
  sender: string;
  freelancer: string;
  milestoneNames: string[];
  /** Per-milestone amounts in base units; must sum to `totalBase`. */
  milestoneAmountsBase: bigint[];
  totalBase: bigint;
  durationMs: number;
  disputeWindowMs?: number;
  revocable?: boolean;
};

/** Lock USDC and create a milestone stream (client signs). */
export function buildCreateStream(a: CreateStreamArgs): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(a.sender);
  tx.moveCall({
    target: `${a.packageId}::stream::create_stream`,
    typeArguments: [a.usdcType],
    arguments: [
      coinWithBalance({ type: a.usdcType, balance: a.totalBase }),
      tx.pure.address(a.freelancer),
      tx.pure.vector("string", a.milestoneNames),
      tx.pure.vector("u64", a.milestoneAmountsBase),
      tx.pure.u64(a.durationMs),
      tx.pure.u64(a.disputeWindowMs ?? DEFAULT_DISPUTE_WINDOW_MS),
      tx.pure.bool(a.revocable ?? true),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

/**
 * Like `buildCreateStream` but with an auto-yield split: `yieldBps` of every
 * drip is auto-deposited into the vault.
 */
export function buildCreateStreamV2(
  a: CreateStreamArgs & { yieldBps: number }
): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(a.sender);
  tx.moveCall({
    target: `${a.packageId}::stream::create_stream_v2`,
    typeArguments: [a.usdcType],
    arguments: [
      coinWithBalance({ type: a.usdcType, balance: a.totalBase }),
      tx.pure.address(a.freelancer),
      tx.pure.vector("string", a.milestoneNames),
      tx.pure.vector("u64", a.milestoneAmountsBase),
      tx.pure.u64(a.durationMs),
      tx.pure.u64(a.disputeWindowMs ?? DEFAULT_DISPUTE_WINDOW_MS),
      tx.pure.bool(a.revocable ?? true),
      tx.pure.u64(BigInt(a.yieldBps)),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

/**
 * Like `buildCreateStreamV2` but the caller sets the full payout split up front:
 * each `destinations[i]` gets `weightsBps[i]` of every drip, routed to the yield
 * vault when `yieldFlags[i]`. Weights must sum to 10000. Lets a payer honor a
 * recipient's requested multi-wallet split at funding time.
 */
export function buildCreateStreamV3(
  a: CreateStreamArgs & {
    destinations: string[];
    weightsBps: number[];
    yieldFlags: boolean[];
  }
): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(a.sender);
  tx.moveCall({
    target: `${a.packageId}::stream::create_stream_v3`,
    typeArguments: [a.usdcType],
    arguments: [
      coinWithBalance({ type: a.usdcType, balance: a.totalBase }),
      tx.pure.address(a.freelancer),
      tx.pure.vector("string", a.milestoneNames),
      tx.pure.vector("u64", a.milestoneAmountsBase),
      tx.pure.u64(a.durationMs),
      tx.pure.u64(a.disputeWindowMs ?? DEFAULT_DISPUTE_WINDOW_MS),
      tx.pure.bool(a.revocable ?? true),
      tx.pure.vector("address", a.destinations),
      tx.pure.vector("u64", a.weightsBps.map((w) => BigInt(w))),
      tx.pure.vector("bool", a.yieldFlags),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

export type CreateStreamFromTreasuryArgs = CreateStreamArgs & {
  yieldBps: number;
  treasuryId: string;
  /** When set, calls `treasury::ensure_idle` first (divest if needed). */
  vaultId?: string;
};

/**
 * Hire from the org payroll pool: optionally ensure idle float, then
 * `create_stream_from_treasury_v2` (stream starts dripping immediately).
 */
export function buildCreateStreamFromTreasuryV2(
  a: CreateStreamFromTreasuryArgs
): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(a.sender);
  if (a.vaultId) {
    tx.moveCall({
      target: `${a.packageId}::treasury::ensure_idle`,
      typeArguments: [a.usdcType],
      arguments: [
        tx.object(a.treasuryId),
        tx.object(a.vaultId),
        tx.pure.u64(a.totalBase),
        tx.object(CLOCK),
      ],
    });
  }
  tx.moveCall({
    target: `${a.packageId}::stream::create_stream_from_treasury_v2`,
    typeArguments: [a.usdcType],
    arguments: [
      tx.object(a.treasuryId),
      tx.pure.address(a.freelancer),
      tx.pure.vector("string", a.milestoneNames),
      tx.pure.vector("u64", a.milestoneAmountsBase),
      tx.pure.u64(a.durationMs),
      tx.pure.u64(a.disputeWindowMs ?? DEFAULT_DISPUTE_WINDOW_MS),
      tx.pure.bool(a.revocable ?? true),
      tx.pure.u64(BigInt(a.yieldBps)),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

/** Find a created `Stream<T>` object id from transaction effects. */
export function findCreatedStreamId(
  objectChanges:
    | ReadonlyArray<{
        type: string;
        objectType?: string;
        objectId?: string;
      }>
    | null
    | undefined
): string | undefined {
  if (!objectChanges) return undefined;
  for (const c of objectChanges) {
    if (
      c.type === "created" &&
      c.objectId &&
      typeof c.objectType === "string" &&
      c.objectType.includes("::stream::Stream<")
    ) {
      return c.objectId;
    }
  }
  return undefined;
}

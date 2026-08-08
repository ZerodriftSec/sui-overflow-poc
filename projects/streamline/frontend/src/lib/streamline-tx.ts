import { Transaction, coinWithBalance } from "@mysten/sui/transactions";

import {
  buildCreateStream,
  buildCreateStreamV2,
  buildCreateStreamV3,
  DEFAULT_DISPUTE_WINDOW_MS,
  splitMilestoneAmounts,
  type CreateStreamArgs,
} from "@streamline/sdk";

export {
  buildCreateStream,
  buildCreateStreamV2,
  buildCreateStreamV3,
  DEFAULT_DISPUTE_WINDOW_MS,
  splitMilestoneAmounts,
  type CreateStreamArgs,
};

/**
 * PTB builders for the StreamLine Move package. Create-stream builders live in
 * `@streamline/sdk`; this module keeps the rest of the app Move surface.
 */

/** The shared on-chain Clock object. */
const CLOCK = "0x6";

/** Route essentially all drips through the yield vault; payments draw from the pool. */
export const DEFAULT_STREAM_YIELD_BPS = 9_999;

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

// === Yield vault (Scallop-shaped) ===

export type VaultRef = { packageId: string; usdcType: string; vaultId: string };

/**
 * Deposit `amountBase` of USDC into the yield vault. The returned share receipt
 * is transferred back to the signer (Scallop's `mint` returns the sCoin).
 */
export function buildVaultDeposit(
  a: VaultRef & { sender: string; amountBase: bigint }
): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(a.sender);
  const receipt = tx.moveCall({
    target: `${a.packageId}::yield_vault::deposit`,
    typeArguments: [a.usdcType],
    arguments: [
      tx.object(a.vaultId),
      coinWithBalance({ type: a.usdcType, balance: a.amountBase }),
      tx.object(CLOCK),
    ],
  });
  tx.transferObjects([receipt], a.sender);
  return tx;
}

/** Redeem a vault receipt for principal + accrued interest, sent to the signer. */
export function buildVaultRedeem(
  a: VaultRef & { sender: string; receiptId: string }
): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(a.sender);
  const coin = tx.moveCall({
    target: `${a.packageId}::yield_vault::redeem`,
    typeArguments: [a.usdcType],
    arguments: [
      tx.object(a.vaultId),
      tx.object(a.receiptId),
      tx.object(CLOCK),
    ],
  });
  tx.transferObjects([coin], a.sender);
  return tx;
}

// === Lending pool (borrow against a stream) ===

export type PoolRef = { packageId: string; usdcType: string; poolId: string };

/**
 * Borrow `principalBase` against a dripping stream's present value. The borrowed
 * coin and the LoanReceipt both go to the signer.
 */
export function buildBorrow(
  a: PoolRef & { sender: string; streamId: string; principalBase: bigint }
): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(a.sender);
  const coin = tx.moveCall({
    target: `${a.packageId}::collateral::borrow`,
    typeArguments: [a.usdcType],
    arguments: [
      tx.object(a.poolId),
      tx.object(a.streamId),
      tx.pure.u64(a.principalBase),
      tx.object(CLOCK),
    ],
  });
  tx.transferObjects([coin], a.sender);
  return tx;
}

/**
 * Repay a loan in full. `owedBase` is the client-computed amount due; we add a
 * tiny buffer so per-second interest drift can't underpay (the change comes
 * back to the signer).
 */
export function buildRepay(
  a: PoolRef & { sender: string; loanId: string; owedBase: bigint }
): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(a.sender);
  const payment = coinWithBalance({
    type: a.usdcType,
    balance: a.owedBase + 10_000n, // +0.01 USDC interest-drift buffer
  });
  const change = tx.moveCall({
    target: `${a.packageId}::collateral::repay`,
    typeArguments: [a.usdcType],
    arguments: [
      tx.object(a.poolId),
      tx.object(a.loanId),
      payment,
      tx.object(CLOCK),
    ],
  });
  tx.transferObjects([change], a.sender);
  return tx;
}

type StreamRef = { packageId: string; usdcType: string; streamId: string };

/** Freelancer signals the current milestone is complete. */
export function buildRaiseCompletion(r: StreamRef): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${r.packageId}::stream::raise_completion`,
    typeArguments: [r.usdcType],
    arguments: [tx.object(r.streamId), tx.object(CLOCK)],
  });
  return tx;
}

/**
 * Client cancels a revocable stream via the StreamCap: the unstreamed balance is
 * refunded to the client and the stream closes. The cap is consumed.
 */
export function buildCancel(r: StreamRef & { capId: string }): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${r.packageId}::stream::cancel`,
    typeArguments: [r.usdcType],
    arguments: [tx.object(r.capId), tx.object(r.streamId)],
  });
  return tx;
}

/**
 * Cancel a treasury-funded (payroll) stream via the StreamCap: settle nothing
 * further, refund the unstreamed balance back to the treasury pool, close the
 * stream, and consume the cap. Works in any state (revocable caps only).
 */
export function buildCancelToTreasury(
  r: StreamRef & { capId: string; treasuryId: string }
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${r.packageId}::stream::cancel_to_treasury`,
    typeArguments: [r.usdcType],
    arguments: [
      tx.object(r.capId),
      tx.object(r.streamId),
      tx.object(r.treasuryId),
    ],
  });
  return tx;
}

/** Client approves the raised milestone via the StreamCap. */
export function buildApproveMilestone(r: StreamRef & { capId: string }): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${r.packageId}::stream::approve_milestone`,
    typeArguments: [r.usdcType],
    arguments: [tx.object(r.capId), tx.object(r.streamId), tx.object(CLOCK)],
  });
  return tx;
}

/**
 * Payer-side start via the StreamCap: move a LOCKED (or PENDING_REVIEW) payroll
 * stream straight to DRIPPING — the org funded it, so the org starts it, no
 * freelancer raise_completion needed. Covers both states `approve_milestone`
 * can't (LOCKED), so the Start button uses this for every not-yet-live stream.
 */
export function buildStartPayroll(r: StreamRef & { capId: string }): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${r.packageId}::stream::start_payroll`,
    typeArguments: [r.usdcType],
    arguments: [tx.object(r.capId), tx.object(r.streamId), tx.object(CLOCK)],
  });
  return tx;
}

/** Permissionless settlement — the keeper (or anyone) pushes a drip. */
export function buildDrip(r: StreamRef): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${r.packageId}::stream::drip`,
    typeArguments: [r.usdcType],
    arguments: [tx.object(r.streamId), tx.object(CLOCK)],
  });
  return tx;
}

/** Either party pauses a pending/dripping stream. */
export function buildRaiseDispute(r: StreamRef): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${r.packageId}::stream::raise_dispute`,
    typeArguments: [r.usdcType],
    arguments: [tx.object(r.streamId)],
  });
  return tx;
}

/** Org payroll hold (sender only) — settles accrued then freezes. */
export function buildSuspendPayroll(r: StreamRef): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${r.packageId}::stream::suspend_payroll`,
    typeArguments: [r.usdcType],
    arguments: [tx.object(r.streamId), tx.object(CLOCK)],
  });
  return tx;
}

/** Org resumes a suspended payroll stream. */
export function buildResumePayroll(r: StreamRef): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${r.packageId}::stream::resume_payroll`,
    typeArguments: [r.usdcType],
    arguments: [tx.object(r.streamId), tx.object(CLOCK)],
  });
  return tx;
}

/** Permanent stop; refund unearned balance to the payroll treasury. */
export function buildStopPayroll(
  r: StreamRef & { treasuryId: string }
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${r.packageId}::stream::stop_payroll`,
    typeArguments: [r.usdcType],
    arguments: [
      tx.object(r.streamId),
      tx.object(r.treasuryId),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

/**
 * Propose how to end a dispute on a PAUSED stream. `resume` returns it to
 * dripping; otherwise the remaining balance splits, `freelancerBps` to the
 * freelancer and the rest back to the client. The counterparty must accept.
 */
export function buildProposeResolution(
  r: StreamRef & { resume: boolean; freelancerBps: number }
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${r.packageId}::stream::propose_resolution`,
    typeArguments: [r.usdcType],
    arguments: [
      tx.object(r.streamId),
      tx.pure.bool(r.resume),
      tx.pure.u64(BigInt(r.freelancerBps)),
    ],
  });
  return tx;
}

/** Accept the counterparty's pending resolution, executing the agreed outcome. */
export function buildAcceptResolution(r: StreamRef): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${r.packageId}::stream::accept_resolution`,
    typeArguments: [r.usdcType],
    arguments: [tx.object(r.streamId), tx.object(CLOCK)],
  });
  return tx;
}

export type SetSplitsArgs = StreamRef & {
  destinations: string[];
  weightsBps: number[];
  yieldFlags: boolean[];
};

/** Freelancer configures where each drip is routed (weights sum to 10000). */
export function buildSetSplits(a: SetSplitsArgs): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${a.packageId}::stream::set_splits`,
    typeArguments: [a.usdcType],
    arguments: [
      tx.object(a.streamId),
      tx.pure.vector("address", a.destinations),
      tx.pure.vector("u64", a.weightsBps),
      tx.pure.vector("bool", a.yieldFlags),
    ],
  });
  return tx;
}

/** Borrow against a dripping stream — mints a CollateralReceipt. */
export function buildCollateralize(
  r: StreamRef & { lender: string; principalBase: bigint; autoRepay: boolean }
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${r.packageId}::collateral::collateralize`,
    typeArguments: [r.usdcType],
    arguments: [
      tx.object(r.streamId),
      tx.pure.address(r.lender),
      tx.pure.u64(r.principalBase),
      tx.pure.bool(r.autoRepay),
    ],
  });
  return tx;
}

/** Mint test USDC from the shared faucet treasury to the signer. */
export function buildMintTestUsdc(a: {
  packageId: string;
  treasuryId: string;
  amountBase: bigint;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${a.packageId}::mock_usdc::faucet`,
    arguments: [tx.object(a.treasuryId), tx.pure.u64(a.amountBase)],
  });
  return tx;
}

// === Org treasury (the Pro pool) ===

export type TreasuryRef = {
  packageId: string;
  usdcType: string;
  sender: string;
  treasuryId: string;
};

/** Open a new org treasury (shared object) owned by the signer. */
export function buildOpenTreasury(a: {
  packageId: string;
  usdcType: string;
  sender: string;
}): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(a.sender);
  tx.moveCall({
    target: `${a.packageId}::treasury::open`,
    typeArguments: [a.usdcType],
    arguments: [],
  });
  return tx;
}

/** Deposit USDC into the treasury float (Fund pool). */
export function buildTreasuryDeposit(
  a: TreasuryRef & { amountBase: bigint }
): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(a.sender);
  tx.moveCall({
    target: `${a.packageId}::treasury::deposit`,
    typeArguments: [a.usdcType],
    arguments: [
      tx.object(a.treasuryId),
      coinWithBalance({ type: a.usdcType, balance: a.amountBase }),
    ],
  });
  return tx;
}

/**
 * Customer pays a payment QR: pull `amountBase` USDC from the payer and settle
 * it into the merchant's treasury via `pos::pay`, tagged with `qrId` so per-QR
 * totals aggregate from the emitted `PosPaid` events.
 */
export function buildPosPay(a: {
  packageId: string;
  usdcType: string;
  sender: string;
  qrId: string;
  treasuryId: string;
  amountBase: bigint;
}): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(a.sender);
  tx.moveCall({
    target: `${a.packageId}::pos::pay`,
    typeArguments: [a.usdcType],
    arguments: [
      tx.pure.string(a.qrId),
      coinWithBalance({ type: a.usdcType, balance: a.amountBase }),
      tx.object(a.treasuryId),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

/** Withdraw idle float back to the owner. */
export function buildTreasuryWithdraw(
  a: TreasuryRef & { amountBase: bigint }
): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(a.sender);
  const coin = tx.moveCall({
    target: `${a.packageId}::treasury::withdraw`,
    typeArguments: [a.usdcType],
    arguments: [tx.object(a.treasuryId), tx.pure.u64(a.amountBase)],
  });
  tx.transferObjects([coin], a.sender);
  return tx;
}

/** Move `amountBase` of idle float into the yield vault (Allocate). */
export function buildTreasuryInvest(
  a: TreasuryRef & { vaultId: string; amountBase: bigint }
): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(a.sender);
  tx.moveCall({
    target: `${a.packageId}::treasury::invest`,
    typeArguments: [a.usdcType],
    arguments: [
      tx.object(a.treasuryId),
      tx.object(a.vaultId),
      tx.pure.u64(a.amountBase),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

/** Redeem the entire invested position back to idle (Divest). */
export function buildTreasuryDivest(
  a: TreasuryRef & { vaultId: string }
): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(a.sender);
  tx.moveCall({
    target: `${a.packageId}::treasury::divest`,
    typeArguments: [a.usdcType],
    arguments: [tx.object(a.treasuryId), tx.object(a.vaultId), tx.object(CLOCK)],
  });
  return tx;
}

/** Park `amountBase` of idle float into the earmarked reserve (Liquid → Reserve). */
export function buildTreasuryToReserve(
  a: TreasuryRef & { amountBase: bigint }
): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(a.sender);
  tx.moveCall({
    target: `${a.packageId}::treasury::to_reserve`,
    typeArguments: [a.usdcType],
    arguments: [tx.object(a.treasuryId), tx.pure.u64(a.amountBase)],
  });
  return tx;
}

/** Release `amountBase` from reserve back to idle float (Reserve → Liquid). */
export function buildTreasuryFromReserve(
  a: TreasuryRef & { amountBase: bigint }
): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(a.sender);
  tx.moveCall({
    target: `${a.packageId}::treasury::from_reserve`,
    typeArguments: [a.usdcType],
    arguments: [tx.object(a.treasuryId), tx.pure.u64(a.amountBase)],
  });
  return tx;
}

/** Reserve → Yield: release from reserve, then invest it — one atomic PTB. */
export function buildReserveToYield(
  a: TreasuryRef & { vaultId: string; amountBase: bigint }
): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(a.sender);
  tx.moveCall({
    target: `${a.packageId}::treasury::from_reserve`,
    typeArguments: [a.usdcType],
    arguments: [tx.object(a.treasuryId), tx.pure.u64(a.amountBase)],
  });
  tx.moveCall({
    target: `${a.packageId}::treasury::invest`,
    typeArguments: [a.usdcType],
    arguments: [
      tx.object(a.treasuryId),
      tx.object(a.vaultId),
      tx.pure.u64(a.amountBase),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

/** Yield → Reserve: divest the whole vault position back to idle, then park
 *  `amountBase` of it into reserve — one atomic PTB (divest is all-or-nothing). */
export function buildYieldToReserve(
  a: TreasuryRef & { vaultId: string; amountBase: bigint }
): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(a.sender);
  tx.moveCall({
    target: `${a.packageId}::treasury::divest`,
    typeArguments: [a.usdcType],
    arguments: [tx.object(a.treasuryId), tx.object(a.vaultId), tx.object(CLOCK)],
  });
  tx.moveCall({
    target: `${a.packageId}::treasury::to_reserve`,
    typeArguments: [a.usdcType],
    arguments: [tx.object(a.treasuryId), tx.pure.u64(a.amountBase)],
  });
  return tx;
}

/**
 * Redeem the whole vault position back to idle, then withdraw `amountBase` to the
 * wallet — one atomic PTB. Used when a withdrawal exceeds the liquid balance.
 */
export function buildTreasuryDivestWithdraw(
  a: TreasuryRef & { vaultId: string; amountBase: bigint }
): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(a.sender);
  tx.moveCall({
    target: `${a.packageId}::treasury::divest`,
    typeArguments: [a.usdcType],
    arguments: [tx.object(a.treasuryId), tx.object(a.vaultId), tx.object(CLOCK)],
  });
  const coin = tx.moveCall({
    target: `${a.packageId}::treasury::withdraw`,
    typeArguments: [a.usdcType],
    arguments: [tx.object(a.treasuryId), tx.pure.u64(a.amountBase)],
  });
  tx.transferObjects([coin], a.sender);
  return tx;
}

// === ZK gift cards (amount hidden until claim) ===

export type CreateGiftCardArgs = {
  packageId: string;
  usdcType: string;
  vaultId: string;
  sender: string;
  amountBase: bigint;
  /** Poseidon(amount, blinding) as 32 LE bytes */
  commitment: number[] | Uint8Array;
  wrapProof: number[] | Uint8Array;
  /** blake2b256(secret) */
  claimHash: number[] | Uint8Array;
  note?: string;
  /** 0 = never; else absolute ms since epoch */
  expiresMs?: number;
};

/** Lock USDC into the gift-card vault behind a wrap proof. */
export function buildCreateGiftCard(a: CreateGiftCardArgs): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(a.sender);
  tx.moveCall({
    target: `${a.packageId}::giftcard::create`,
    typeArguments: [a.usdcType],
    arguments: [
      tx.object(a.vaultId),
      coinWithBalance({ type: a.usdcType, balance: a.amountBase }),
      tx.pure.vector("u8", Array.from(a.commitment)),
      tx.pure.vector("u8", Array.from(a.wrapProof)),
      tx.pure.vector("u8", Array.from(a.claimHash)),
      tx.pure.string(a.note ?? ""),
      tx.pure.u64(BigInt(a.expiresMs ?? 0)),
    ],
  });
  return tx;
}

export function buildClaimGiftCard(a: {
  packageId: string;
  usdcType: string;
  vaultId: string;
  sender: string;
  cardId: string;
  secretBytes: Uint8Array | number[];
  value: bigint;
  unwrapProof: number[] | Uint8Array;
}): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(a.sender);
  const coin = tx.moveCall({
    target: `${a.packageId}::giftcard::claim`,
    typeArguments: [a.usdcType],
    arguments: [
      tx.object(a.vaultId),
      tx.object(a.cardId),
      tx.pure.vector("u8", Array.from(a.secretBytes)),
      tx.pure.u64(a.value),
      tx.pure.vector("u8", Array.from(a.unwrapProof)),
      tx.object(CLOCK),
    ],
  });
  tx.transferObjects([coin], a.sender);
  return tx;
}

export function buildCancelGiftCard(a: {
  packageId: string;
  usdcType: string;
  vaultId: string;
  sender: string;
  cardId: string;
  value: bigint;
  unwrapProof: number[] | Uint8Array;
}): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(a.sender);
  const coin = tx.moveCall({
    target: `${a.packageId}::giftcard::cancel`,
    typeArguments: [a.usdcType],
    arguments: [
      tx.object(a.vaultId),
      tx.object(a.cardId),
      tx.pure.u64(a.value),
      tx.pure.vector("u8", Array.from(a.unwrapProof)),
    ],
  });
  tx.transferObjects([coin], a.sender);
  return tx;
}

/** Find a created `GiftCard` object id from transaction effects. */
export function findCreatedGiftCardId(
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
      // Exact type — avoid matching GiftCardVault
      /::giftcard::GiftCard($|<)/.test(c.objectType)
    ) {
      return c.objectId;
    }
  }
  return undefined;
}

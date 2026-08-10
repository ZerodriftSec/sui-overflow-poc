/**
 * Overfund + private split — deposit a round/padded amount, then spend into
 * (work note = desired) + change so the public edge amount ≠ economic amount.
 */

import { randomBlinding } from "@/lib/confidential";
import {
  pk,
  proveDeposit,
  proveShielded,
  signalsBig,
  merklePath,
  fetchCommitments,
} from "@/lib/shielded";
import type { SuiClient } from "@mysten/sui/client";

/** USDC base units (6 decimals): $50 buckets. */
const BUCKET = 50n * 1_000_000n;

/**
 * Round `desired` up to the next $50 USDC. If already on a bucket boundary,
 * add one more bucket so the public deposit never equals the work amount.
 */
export function overfundAmount(desiredBase: bigint): bigint {
  if (desiredBase <= 0n) return BUCKET;
  const rounded = ((desiredBase + BUCKET - 1n) / BUCKET) * BUCKET;
  return rounded === desiredBase ? desiredBase + BUCKET : rounded;
}

export type OverfundDepositProof = {
  /** Public deposit size (overfunded). */
  depositBase: bigint;
  /** Intended private note size after split. */
  desiredBase: bigint;
  /** Change kept after split. */
  changeBase: bigint;
  rhoDeposit: bigint;
  cmDeposit: bigint;
  depositProof: Uint8Array;
  pkv: bigint;
};

/** Prove a deposit note for the overfunded amount. */
export async function proveOverfundDeposit(p: {
  sk: bigint;
  desiredBase: bigint;
}): Promise<OverfundDepositProof> {
  const depositBase = overfundAmount(p.desiredBase);
  const changeBase = depositBase - p.desiredBase;
  const pkv = await pk(p.sk);
  const rhoDeposit = randomBlinding();
  const dep = await proveDeposit(depositBase, pkv, rhoDeposit);
  return {
    depositBase,
    desiredBase: p.desiredBase,
    changeBase,
    rhoDeposit,
    cmDeposit: BigInt(dep.publicSignals[0]),
    depositProof: dep.proof,
    pkv,
  };
}

export type SplitAfterDeposit = {
  root: bigint;
  nf: bigint;
  cmWork: bigint;
  cmChange: bigint;
  rhoWork: bigint;
  rhoChange: bigint;
  proof: Uint8Array;
};

/**
 * After the overfund note is in the tree, prove a spend:
 * deposit → work(desired) + change.
 */
export async function proveSplitAfterDeposit(p: {
  client: SuiClient;
  packageId: string;
  sk: bigint;
  pkv: bigint;
  cmDeposit: bigint;
  rhoDeposit: bigint;
  depositBase: bigint;
  desiredBase: bigint;
}): Promise<SplitAfterDeposit> {
  const changeBase = p.depositBase - p.desiredBase;
  // Tree must include the new leaf — poll briefly.
  let commitments = await fetchCommitments(p.client, p.packageId);
  let leafIndex = commitments.findIndex((c) => c === p.cmDeposit);
  for (let i = 0; i < 15 && leafIndex < 0; i++) {
    await new Promise((r) => setTimeout(r, 800));
    commitments = await fetchCommitments(p.client, p.packageId);
    leafIndex = commitments.findIndex((c) => c === p.cmDeposit);
  }
  if (leafIndex < 0) {
    throw new Error("overfund_note_not_in_tree");
  }

  const { pathElements, pathIndices } = await merklePath(
    commitments,
    leafIndex
  );
  const rhoWork = randomBlinding();
  const rhoChange = randomBlinding();
  const pf = await proveShielded({
    valueIn: p.depositBase,
    sk: p.sk,
    rhoIn: p.rhoDeposit,
    pathElements,
    pathIndices,
    v1: p.desiredBase,
    pk1: p.pkv,
    rho1: rhoWork,
    v2: changeBase,
    pk2: p.pkv,
    rho2: rhoChange,
  });
  const [rootSig, nf, cmWork, cmChange] = signalsBig(pf);
  return {
    root: rootSig,
    nf,
    cmWork,
    cmChange,
    rhoWork,
    rhoChange,
    proof: pf.proof,
  };
}

export { BUCKET as OVERFUND_BUCKET_BASE };

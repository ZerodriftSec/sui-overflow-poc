/**
 * Confidential streaming client: compute Poseidon commitments, generate Groth16
 * proofs in the browser (snarkjs over the circuits in /public/circuits), and
 * build the PTBs for streamline::stream's confidential entry functions.
 *
 * Proving runs entirely client-side, so hidden amounts/blindings never leave the
 * device. The serializer here is a TS port of circuits/prover/serialize.mjs and
 * is byte-identical to the arkworks output sui::groth16 verifies.
 *
 * snarkjs / circomlibjs are heavy and browser/Node-only — imported dynamically.
 */
import { Transaction, coinWithBalance } from "@mysten/sui/transactions";

export const FIELD =
  21888242871839275222246405745257275088696311157297823662689037894645226208583n;

const CIRCUITS_BASE = "/circuits";

// === Field / point serialization (arkworks-compressed BN254) ===

function leBytes(x: bigint): Uint8Array {
  let v = ((x % FIELD) + FIELD) % FIELD;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function yIsLarger(y: bigint): boolean {
  const yy = ((y % FIELD) + FIELD) % FIELD;
  return yy > (FIELD - yy) % FIELD;
}

function g1(p: string[]): Uint8Array {
  const b = leBytes(BigInt(p[0]));
  if (yIsLarger(BigInt(p[1]))) b[31] |= 0x80;
  return b;
}

function g2(p: string[][]): Uint8Array {
  const x0 = BigInt(p[0][0]);
  const x1 = BigInt(p[0][1]);
  const y0 = BigInt(p[1][0]);
  const y1 = BigInt(p[1][1]);
  const out = new Uint8Array(64);
  out.set(leBytes(x0), 0);
  out.set(leBytes(x1), 32);
  const ny0 = (FIELD - ((y0 % FIELD) + FIELD) % FIELD) % FIELD;
  const ny1 = (FIELD - ((y1 % FIELD) + FIELD) % FIELD) % FIELD;
  const larger = y1 === ny1 ? y0 > ny0 : y1 > ny1;
  if (larger) out[63] |= 0x80;
  return out;
}

function u64le(n: number): Uint8Array {
  const out = new Uint8Array(8);
  let v = BigInt(n);
  for (let i = 0; i < 8; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function concat(arrays: Uint8Array[]): Uint8Array {
  const len = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function vkToBytes(vk: any): Uint8Array {
  const ic: Uint8Array[] = vk.IC.map(g1);
  return concat([
    g1(vk.vk_alpha_1),
    g2(vk.vk_beta_2),
    g2(vk.vk_gamma_2),
    g2(vk.vk_delta_2),
    u64le(ic.length),
    ...ic,
  ]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function proofToBytes(proof: any): Uint8Array {
  return concat([g1(proof.pi_a), g2(proof.pi_b), g1(proof.pi_c)]);
}

function publicToBytes(signals: string[]): Uint8Array {
  return concat(signals.map((s) => leBytes(BigInt(s))));
}

// === Poseidon commitments ===

let poseidonPromise: Promise<(inputs: bigint[]) => bigint> | null = null;

async function getPoseidon() {
  if (!poseidonPromise) {
    poseidonPromise = (async () => {
      const { buildPoseidon } = await import("circomlibjs");
      const poseidon = await buildPoseidon();
      return (inputs: bigint[]) =>
        BigInt(poseidon.F.toString(poseidon(inputs)));
    })();
  }
  return poseidonPromise;
}

/** Commitment field element C = Poseidon(value, blinding). */
export async function commitScalar(value: bigint, blinding: bigint): Promise<bigint> {
  const poseidon = await getPoseidon();
  return poseidon([value, blinding]);
}

/** Commitment as the 32-byte little-endian vector<u8> stored on-chain. */
export async function commit(value: bigint, blinding: bigint): Promise<Uint8Array> {
  return leBytes(await commitScalar(value, blinding));
}

/** A random blinding factor in the scalar field. */
export function randomBlinding(): bigint {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  let v = 0n;
  for (let i = 31; i >= 0; i--) v = (v << 8n) | BigInt(buf[i]);
  return v % FIELD;
}

// === Proving ===

export type ProofBytes = {
  vk: Uint8Array;
  proof: Uint8Array;
  inputs: Uint8Array;
  publicSignals: string[];
};

type CircuitName =
  | "wrap"
  | "transfer"
  | "unwrap"
  | "lazydrip"
  | "shielded"
  | "deposit"
  | "withdraw"
  | "private_settle";

/** Poseidon hash of field elements (matches sui::poseidon + the circuits). */
export async function poseidon(inputs: bigint[]): Promise<bigint> {
  return (await getPoseidon())(inputs);
}

/** Field element → 32-byte little-endian (the on-chain scalar encoding). */
export function feToLeBytes(x: bigint): Uint8Array {
  return leBytes(x);
}

/** Generate a Groth16 proof in-browser and serialize to Sui bytes. */
export async function prove(
  circuit: CircuitName,
  input: Record<string, string>
): Promise<ProofBytes> {
  const snarkjs = await import("snarkjs");
  const wasm = `${CIRCUITS_BASE}/${circuit}.wasm`;
  const zkey = `${CIRCUITS_BASE}/${circuit}.zkey`;
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);

  const vk = await (await fetch(`${CIRCUITS_BASE}/${circuit}.vkey.json`)).json();
  if (!(await snarkjs.groth16.verify(vk, publicSignals, proof))) {
    throw new Error(`${circuit}: local verification failed`);
  }
  return {
    vk: vkToBytes(vk),
    proof: proofToBytes(proof),
    inputs: publicToBytes(publicSignals),
    publicSignals,
  };
}

// === High-level stream helpers ===

const s = (x: bigint | number) => x.toString();

/** Wrap proof binding a public `amount` to commitment(amount, blinding). */
export function proveWrap(amount: bigint, blinding: bigint) {
  return prove("wrap", { amount: s(amount), blinding: s(blinding) });
}

/** Transfer/drip proof: move `delta` sender→recipient (hidden). */
export function proveDrip(p: {
  senderOld: bigint;
  rSenderOld: bigint;
  rSenderNew: bigint;
  recipientOld: bigint;
  rRecipientOld: bigint;
  rRecipientNew: bigint;
  delta: bigint;
}) {
  return prove("transfer", {
    vSenderOld: s(p.senderOld),
    rSenderOld: s(p.rSenderOld),
    rSenderNew: s(p.rSenderNew),
    vRecipientOld: s(p.recipientOld),
    rRecipientOld: s(p.rRecipientOld),
    rRecipientNew: s(p.rRecipientNew),
    delta: s(p.delta),
  });
}

/** Unwrap proof: reveal `value` and prove it opens commitment(value, blinding). */
export function proveUnwrap(value: bigint, blinding: bigint) {
  return prove("unwrap", { value: s(value), blinding: s(blinding) });
}

/** Params commitment Poseidon(rate, start, cap, blinding) pinning the schedule. */
export async function commitParams(
  rate: bigint,
  start: bigint,
  cap: bigint,
  blinding: bigint
): Promise<Uint8Array> {
  const poseidon = await getPoseidon();
  return leBytes(poseidon([rate, start, cap, blinding]));
}

/**
 * Lazy-stream settle proof: move a hidden `delta` remaining→earned, bounded by
 * earned_new ≤ min(cap, rate·(nowSec − start)). Returns the ProofBytes; the new
 * commitments are `publicSignals[1]` (remaining) and `[3]` (earned) — use
 * `lazyNewCommitments`.
 */
export function proveLazyDrip(p: {
  remainingOld: bigint;
  rRemOld: bigint;
  rRemNew: bigint;
  earnedOld: bigint;
  rEarnedOld: bigint;
  rEarnedNew: bigint;
  delta: bigint;
  rate: bigint;
  start: bigint;
  cap: bigint;
  rParams: bigint;
  nowSec: bigint;
}) {
  return prove("lazydrip", {
    vRemOld: s(p.remainingOld),
    rRemOld: s(p.rRemOld),
    rRemNew: s(p.rRemNew),
    vEarnedOld: s(p.earnedOld),
    rEarnedOld: s(p.rEarnedOld),
    rEarnedNew: s(p.rEarnedNew),
    delta: s(p.delta),
    rate: s(p.rate),
    start: s(p.start),
    cap: s(p.cap),
    rParams: s(p.rParams),
    nowSec: s(p.nowSec),
  });
}

/** Extract the new remaining/earned commitments from a lazydrip proof result. */
export function lazyNewCommitments(pf: ProofBytes): {
  newRemaining: Uint8Array;
  newEarned: Uint8Array;
} {
  return {
    newRemaining: leBytes(BigInt(pf.publicSignals[1])),
    newEarned: leBytes(BigInt(pf.publicSignals[3])),
  };
}

// === PTB builders (match streamline::stream confidential entries) ===

const CLOCK_ID = "0x6";

function vec(tx: Transaction, bytes: Uint8Array) {
  return tx.pure.vector("u8", Array.from(bytes));
}

// === Confidential balances (Tier 1: hide amounts) ===

/**
 * Wrap `amountBase` USDC into a confidential balance: deposit the coin and bind
 * it to `commitment` = Poseidon(amount, blinding), proven by `proof` (wrap.circom)
 * to open to that amount. On-chain only the commitment + aggregate reserve are
 * visible — the individual balance is hidden.
 */
export function buildConfWrap(args: {
  packageId: string;
  coinType: string;
  sender: string;
  poolId: string;
  amountBase: bigint;
  commitment: Uint8Array;
  proof: Uint8Array;
}): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(args.sender);
  tx.moveCall({
    target: `${args.packageId}::confidential_balance::wrap`,
    typeArguments: [args.coinType],
    arguments: [
      tx.object(args.poolId),
      coinWithBalance({ type: args.coinType, balance: args.amountBase }),
      vec(tx, args.commitment),
      vec(tx, args.proof),
    ],
  });
  return tx;
}

/**
 * Unwrap: reveal `valueBase`, prove (unwrap.circom) it opens your on-chain
 * commitment, withdraw it from the reserve, and close the account. The returned
 * coin is sent back to the caller.
 */
export function buildConfUnwrap(args: {
  packageId: string;
  coinType: string;
  sender: string;
  poolId: string;
  valueBase: bigint;
  proof: Uint8Array;
}): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(args.sender);
  const coin = tx.moveCall({
    target: `${args.packageId}::confidential_balance::unwrap`,
    typeArguments: [args.coinType],
    arguments: [
      tx.object(args.poolId),
      tx.pure.u64(args.valueBase),
      vec(tx, args.proof),
    ],
  });
  tx.transferObjects([coin], args.sender);
  return tx;
}

export function buildCreateConfidentialStream(args: {
  packageId: string;
  coinType: string;
  payment: ReturnType<Transaction["object"]>;
  freelancer: string;
  nMilestones: number;
  remainingCommitment: Uint8Array;
  wrapProof: Uint8Array;
  earnedCommitment: Uint8Array;
  disputeWindowMs: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${args.packageId}::stream::create_confidential_stream`,
    typeArguments: [args.coinType],
    arguments: [
      args.payment,
      tx.pure.address(args.freelancer),
      tx.pure.u64(args.nMilestones),
      vec(tx, args.remainingCommitment),
      vec(tx, args.wrapProof),
      vec(tx, args.earnedCommitment),
      tx.pure.u64(args.disputeWindowMs),
    ],
  });
  return tx;
}

/** v2: also attaches the Seal-encrypted secrets so the freelancer can act. */
export function buildCreateConfidentialStreamV2(args: {
  packageId: string;
  coinType: string;
  /** Creator address — needed so `coinWithBalance` can resolve their coins. */
  sender: string;
  totalBase: bigint;
  freelancer: string;
  nMilestones: number;
  remainingCommitment: Uint8Array;
  wrapProof: Uint8Array;
  earnedCommitment: Uint8Array;
  disputeWindowMs: number;
  encryptedSecrets: Uint8Array;
}): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(args.sender);
  tx.moveCall({
    target: `${args.packageId}::stream::create_confidential_stream_v2`,
    typeArguments: [args.coinType],
    arguments: [
      coinWithBalance({ type: args.coinType, balance: args.totalBase }),
      tx.pure.address(args.freelancer),
      tx.pure.u64(args.nMilestones),
      vec(tx, args.remainingCommitment),
      vec(tx, args.wrapProof),
      vec(tx, args.earnedCommitment),
      tx.pure.u64(args.disputeWindowMs),
      vec(tx, args.encryptedSecrets),
    ],
  });
  return tx;
}

/** v2 drip: rotates blindings + the on-chain Seal ciphertext atomically. */
export function buildConfidentialDripV2(args: {
  packageId: string;
  coinType: string;
  streamId: string;
  newRemainingCommitment: Uint8Array;
  newEarnedCommitment: Uint8Array;
  transferProof: Uint8Array;
  encryptedSecrets: Uint8Array;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${args.packageId}::stream::confidential_drip_v2`,
    typeArguments: [args.coinType],
    arguments: [
      tx.object(args.streamId),
      vec(tx, args.newRemainingCommitment),
      vec(tx, args.newEarnedCommitment),
      vec(tx, args.transferProof),
      vec(tx, args.encryptedSecrets),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

/** Freelancer raises the current milestone; drips pause for client review. */
export function buildConfRaiseCompletion(args: {
  packageId: string;
  coinType: string;
  streamId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${args.packageId}::stream::conf_raise_completion`,
    typeArguments: [args.coinType],
    arguments: [tx.object(args.streamId), tx.object(CLOCK_ID)],
  });
  return tx;
}

/** Client approves the raised milestone via their StreamCap. */
export function buildConfApproveMilestone(args: {
  packageId: string;
  coinType: string;
  streamId: string;
  capId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${args.packageId}::stream::conf_approve_milestone`,
    typeArguments: [args.coinType],
    arguments: [tx.object(args.capId), tx.object(args.streamId)],
  });
  return tx;
}

/**
 * v2 claim: withdraw earned funds *and* refresh the on-chain Seal ciphertext
 * (the claim resets the earned blinding) in one PTB.
 */
export function buildClaimV2(args: {
  packageId: string;
  coinType: string;
  streamId: string;
  amount: bigint;
  unwrapProof: Uint8Array;
  resetCommitment: Uint8Array;
  recipient: string;
  encryptedSecrets: Uint8Array;
}): Transaction {
  const tx = new Transaction();
  const coin = tx.moveCall({
    target: `${args.packageId}::stream::claim`,
    typeArguments: [args.coinType],
    arguments: [
      tx.object(args.streamId),
      tx.pure.u64(args.amount),
      vec(tx, args.unwrapProof),
      vec(tx, args.resetCommitment),
    ],
  });
  tx.moveCall({
    target: `${args.packageId}::stream::update_confidential_secrets`,
    typeArguments: [args.coinType],
    arguments: [tx.object(args.streamId), vec(tx, args.encryptedSecrets)],
  });
  tx.transferObjects([coin], tx.pure.address(args.recipient));
  return tx;
}

/** Either party pauses a confidential stream pending arbitration. */
export function buildConfDispute(args: {
  packageId: string;
  coinType: string;
  streamId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${args.packageId}::stream::confidential_dispute`,
    typeArguments: [args.coinType],
    arguments: [tx.object(args.streamId)],
  });
  return tx;
}

export function buildConfidentialDrip(args: {
  packageId: string;
  coinType: string;
  streamId: string;
  newRemainingCommitment: Uint8Array;
  newEarnedCommitment: Uint8Array;
  transferProof: Uint8Array;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${args.packageId}::stream::confidential_drip`,
    typeArguments: [args.coinType],
    arguments: [
      tx.object(args.streamId),
      vec(tx, args.newRemainingCommitment),
      vec(tx, args.newEarnedCommitment),
      vec(tx, args.transferProof),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

export function buildClaim(args: {
  packageId: string;
  coinType: string;
  streamId: string;
  amount: bigint;
  unwrapProof: Uint8Array;
  resetCommitment: Uint8Array;
  recipient: string;
}): Transaction {
  const tx = new Transaction();
  const coin = tx.moveCall({
    target: `${args.packageId}::stream::claim`,
    typeArguments: [args.coinType],
    arguments: [
      tx.object(args.streamId),
      tx.pure.u64(args.amount),
      vec(tx, args.unwrapProof),
      vec(tx, args.resetCommitment),
    ],
  });
  tx.transferObjects([coin], tx.pure.address(args.recipient));
  return tx;
}

// === Lazy confidential stream (streamline::lazy_stream) ===

/** Open a lazy confidential stream (locks `capBase`, pins the vesting schedule). */
export function buildCreateLazyStream(args: {
  packageId: string;
  coinType: string;
  sender: string;
  capBase: bigint;
  freelancer: string;
  remainingCommitment: Uint8Array;
  wrapProof: Uint8Array;
  earnedCommitment: Uint8Array;
  paramsCommitment: Uint8Array;
  encryptedSecrets: Uint8Array;
}): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(args.sender);
  tx.moveCall({
    target: `${args.packageId}::lazy_stream::create`,
    typeArguments: [args.coinType],
    arguments: [
      coinWithBalance({ type: args.coinType, balance: args.capBase }),
      tx.pure.address(args.freelancer),
      vec(tx, args.remainingCommitment),
      vec(tx, args.wrapProof),
      vec(tx, args.earnedCommitment),
      vec(tx, args.paramsCommitment),
      vec(tx, args.encryptedSecrets),
    ],
  });
  return tx;
}

/** Lazy settle: move the whole vested-so-far in one proof (no keeper, no drips).
 * `nowSec` is the prover's claimed time (bound into the proof); the contract
 * checks it's not in the future. */
export function buildSettleLazy(args: {
  packageId: string;
  coinType: string;
  streamId: string;
  newRemaining: Uint8Array;
  newEarned: Uint8Array;
  proof: Uint8Array;
  nowSec: bigint;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${args.packageId}::lazy_stream::settle_at`,
    typeArguments: [args.coinType],
    arguments: [
      tx.object(args.streamId),
      vec(tx, args.newRemaining),
      vec(tx, args.newEarned),
      vec(tx, args.proof),
      tx.pure.u64(args.nowSec),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

/** Claim earned to cash (reveals only the claimed total). */
export function buildClaimLazy(args: {
  packageId: string;
  coinType: string;
  streamId: string;
  amount: bigint;
  unwrapProof: Uint8Array;
  recipient: string;
}): Transaction {
  const tx = new Transaction();
  const coin = tx.moveCall({
    target: `${args.packageId}::lazy_stream::claim`,
    typeArguments: [args.coinType],
    arguments: [
      tx.object(args.streamId),
      tx.pure.u64(args.amount),
      vec(tx, args.unwrapProof),
    ],
  });
  tx.transferObjects([coin], tx.pure.address(args.recipient));
  return tx;
}

"use client";

import { Transaction, coinWithBalance } from "@mysten/sui/transactions";
import type { SuiClient } from "@mysten/sui/client";

import { poseidon, prove, feToLeBytes, type ProofBytes } from "@/lib/confidential";
import {
  deriveEnc,
  decryptNote,
  decryptEngagement,
} from "@/lib/shielded-address";
import {
  ORIGINAL_PACKAGE_IDS,
  PRIVATE_STREAM_DEFINING_PACKAGE_IDS,
} from "@/lib/constants";
import { PACKAGE_IDS, type NetworkName } from "@streamline/sdk";

export const SHIELDED_DEPTH = 20;
const CLOCK_ID = "0x6";

// === Note crypto ===

/** Owner public key from a spending key: pk = Poseidon(sk, 0). */
export function pk(sk: bigint): Promise<bigint> {
  return poseidon([sk, 0n]);
}
/** Note commitment cm = Poseidon(value, pk, rho). */
export function noteCommit(value: bigint, pkv: bigint, rho: bigint): Promise<bigint> {
  return poseidon([value, pkv, rho]);
}
/** Nullifier nf = Poseidon(sk, rho). */
export function nullifier(sk: bigint, rho: bigint): Promise<bigint> {
  return poseidon([sk, rho]);
}

// === Merkle tree (matches merkle_tree.move: ZERO_LEAF=0, zeros[i]=H(z,z)) ===

let zerosCache: bigint[] | null = null;
async function zeros(): Promise<bigint[]> {
  if (zerosCache) return zerosCache;
  const z: bigint[] = [0n];
  for (let i = 1; i <= SHIELDED_DEPTH; i++) z[i] = await poseidon([z[i - 1], z[i - 1]]);
  zerosCache = z;
  return z;
}

/** Merkle path + root for `leafIndex` in a tree built from `commitments`
 * (empty slots = zero-subtrees), identical to the on-chain incremental tree. */
export async function merklePath(
  commitments: bigint[],
  leafIndex: number
): Promise<{ pathElements: string[]; pathIndices: string[]; root: string }> {
  const z = await zeros();
  const pathElements: string[] = [];
  const pathIndices: string[] = [];
  let cur = commitments.slice();
  let idx = leafIndex;
  for (let d = 0; d < SHIELDED_DEPTH; d++) {
    const isRight = idx % 2 === 1;
    const sibIdx = isRight ? idx - 1 : idx + 1;
    const sibling = sibIdx < cur.length ? cur[sibIdx] : z[d];
    pathElements.push(sibling.toString());
    pathIndices.push((idx % 2).toString());
    const next: bigint[] = [];
    for (let i = 0; i < cur.length; i += 2) {
      const left = cur[i];
      const right = i + 1 < cur.length ? cur[i + 1] : z[d];
      next.push(await poseidon([left, right]));
    }
    cur = next;
    idx = Math.floor(idx / 2);
  }
  const root = cur.length ? cur[0] : z[SHIELDED_DEPTH];
  return { pathElements, pathIndices, root: root.toString() };
}

// === Discovery: rebuild the commitment list (leaf order) from pool events ===

/**
 * Events must be queried by their DEFINING package (type origin): shielded_pool
 * structs originate in ORIGINAL_PACKAGE_IDS, while private_stream::EngagementSettled
 * originates in the MIDDLE upgrade that first defined private_stream — NOT the
 * original (no private_stream) and NOT the latest package. The public testnet RPCs
 * return NOTHING for the `MoveModule` filter against an upgraded package, so we
 * query by `MoveEventType` with the right origin package instead.
 *
 * Using latestPkg for `settle` silently drops every EngagementSettled leaf (two
 * per settle) from the reconstructed tree, so its root stops matching the on-chain
 * tree the moment any engagement is settled — and every subsequent private split
 * aborts EUnknownRoot. Query settle events under the private_stream defining id.
 */
export function eventPkgs(latestPkg: string): { shielded: string; settle: string } {
  let net: NetworkName = "testnet";
  for (const n of ["testnet", "mainnet", "devnet"] as NetworkName[]) {
    if (PACKAGE_IDS[n] === latestPkg) {
      net = n;
      break;
    }
  }
  const orig = ORIGINAL_PACKAGE_IDS[net];
  const settleOrig = PRIVATE_STREAM_DEFINING_PACKAGE_IDS[net];
  return {
    shielded: orig && orig !== "0x0" ? orig : latestPkg,
    settle: settleOrig && settleOrig !== "0x0" ? settleOrig : latestPkg,
  };
}

type LeafEvent = { ts: bigint; seq: bigint; leaves: bigint[] };

async function collectLeafEvents(
  client: SuiClient,
  eventType: string,
  extract: (pj: Record<string, string>) => bigint[],
  sink: LeafEvent[]
): Promise<void> {
  let cursor: Awaited<ReturnType<SuiClient["queryEvents"]>>["nextCursor"] = null;
  for (let page = 0; page < 20; page++) {
    const res = await client.queryEvents({
      query: { MoveEventType: eventType },
      order: "ascending",
      cursor,
      limit: 200,
    });
    for (const e of res.data) {
      sink.push({
        ts: BigInt(e.timestampMs ?? "0"),
        seq: BigInt(e.id.eventSeq ?? "0"),
        leaves: extract(e.parsedJson as Record<string, string>),
      });
    }
    if (!res.hasNextPage) break;
    cursor = res.nextCursor;
  }
}

/** All note commitments in insertion order (== leaf index), replayed from every
 * leaf-inserting event: Deposited (1 leaf), Spent / EngagementSettled (2), and
 * Withdrawn (1). Each such op is its own tx, so ordering by (checkpoint time,
 * event seq) reproduces the on-chain tree's leaf order. */
export async function fetchCommitments(
  client: SuiClient,
  packageId: string
): Promise<bigint[]> {
  const { shielded, settle } = eventPkgs(packageId);
  const evs: LeafEvent[] = [];
  await collectLeafEvents(client, `${shielded}::shielded_pool::Deposited`, (pj) => [BigInt(pj.commitment)], evs);
  await collectLeafEvents(client, `${shielded}::shielded_pool::Spent`, (pj) => [BigInt(pj.cm1), BigInt(pj.cm2)], evs);
  await collectLeafEvents(client, `${shielded}::shielded_pool::Withdrawn`, (pj) => [BigInt(pj.cm_change)], evs);
  await collectLeafEvents(client, `${settle}::private_stream::EngagementSettled`, (pj) => [BigInt(pj.cm1), BigInt(pj.cm2)], evs);
  evs.sort((a, b) => (a.ts !== b.ts ? (a.ts < b.ts ? -1 : 1) : a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0));
  const out: bigint[] = [];
  for (const e of evs) for (const l of e.leaves) out.push(l);
  return out;
}

/** Every nullifier ever consumed in the pool, as decimal strings. A local note
 * whose nullifier is in this set is already spent on-chain — spending it again
 * aborts with ENullifierUsed. Sourced from Spent / Withdrawn / EngagementSettled
 * (all carry a `nullifier` field). Lets the client reconcile a stale note store
 * against chain before selecting a note. */
export async function fetchUsedNullifiers(
  client: SuiClient,
  packageId: string
): Promise<Set<string>> {
  const { shielded, settle } = eventPkgs(packageId);
  const out = new Set<string>();
  const collect = async (eventType: string) => {
    let cursor: Awaited<ReturnType<SuiClient["queryEvents"]>>["nextCursor"] = null;
    for (let page = 0; page < 20; page++) {
      const res = await client.queryEvents({
        query: { MoveEventType: eventType },
        order: "ascending",
        cursor,
        limit: 200,
      });
      for (const e of res.data) {
        const v = (e.parsedJson as Record<string, string>)?.nullifier;
        if (v != null) out.add(BigInt(v).toString());
      }
      if (!res.hasNextPage) break;
      cursor = res.nextCursor;
    }
  };
  await collect(`${shielded}::shielded_pool::Spent`);
  await collect(`${shielded}::shielded_pool::Withdrawn`);
  await collect(`${settle}::private_stream::EngagementSettled`);
  return out;
}

/** Scan EncryptedNote events for notes addressed to me (cross-party receive).
 * Returns openings whose recomputed commitment matches the on-chain event. */
export async function scanIncoming(
  client: SuiClient,
  packageId: string,
  sk: bigint,
  myPk: bigint
): Promise<{ commitment: string; value: string; rho: string }[]> {
  const { secret, pub } = deriveEnc(sk);
  const out: { commitment: string; value: string; rho: string }[] = [];
  const encType = `${eventPkgs(packageId).shielded}::shielded_pool::EncryptedNote`;
  let cursor: Awaited<ReturnType<SuiClient["queryEvents"]>>["nextCursor"] = null;
  for (let page = 0; page < 20; page++) {
    const res = await client.queryEvents({
      query: { MoveEventType: encType },
      order: "ascending",
      cursor,
      limit: 200,
    });
    for (const e of res.data) {
      if (!e.type.endsWith("::EncryptedNote")) continue;
      const pj = e.parsedJson as { commitment: string; ciphertext: number[] | string };
      const bytes =
        typeof pj.ciphertext === "string"
          ? Uint8Array.from(atob(pj.ciphertext), (c) => c.charCodeAt(0))
          : Uint8Array.from(pj.ciphertext);
      const opening = await decryptNote(secret, pub, bytes);
      if (!opening) continue;
      const cm = await noteCommit(opening.value, myPk, opening.rho);
      if (cm === BigInt(pj.commitment)) {
        out.push({
          commitment: pj.commitment,
          value: opening.value.toString(),
          rho: opening.rho.toString(),
        });
      }
    }
    if (!res.hasNextPage) break;
    cursor = res.nextCursor;
  }
  return out;
}

export type IncomingEngagement = {
  /** funding_cm (the EncryptedNote's commitment tag) — stable id. */
  id: string;
  cap: string;
  rate: string;
  start: string;
  label?: string;
};

/** Scan EncryptedNote events for engagement announcements addressed to me — the
 * receive side of a private engagement. Each is a vesting schedule (cap, rate,
 * start) the opener published at open, encrypted to my shielded address, so my
 * wallet can show the incoming stream before any payment settles. */
export async function scanIncomingEngagements(
  client: SuiClient,
  packageId: string,
  sk: bigint
): Promise<IncomingEngagement[]> {
  const { secret, pub } = deriveEnc(sk);
  const out: IncomingEngagement[] = [];
  const seen = new Set<string>();
  const encType = `${eventPkgs(packageId).shielded}::shielded_pool::EncryptedNote`;
  let cursor: Awaited<ReturnType<SuiClient["queryEvents"]>>["nextCursor"] = null;
  for (let page = 0; page < 20; page++) {
    const res = await client.queryEvents({
      query: { MoveEventType: encType },
      order: "ascending",
      cursor,
      limit: 200,
    });
    for (const e of res.data) {
      if (!e.type.endsWith("::EncryptedNote")) continue;
      const pj = e.parsedJson as { commitment: string; ciphertext: number[] | string };
      const bytes =
        typeof pj.ciphertext === "string"
          ? Uint8Array.from(atob(pj.ciphertext), (c) => c.charCodeAt(0))
          : Uint8Array.from(pj.ciphertext);
      const ann = await decryptEngagement(secret, pub, bytes);
      if (!ann) continue;
      const id = BigInt(pj.commitment).toString();
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        cap: ann.cap.toString(),
        rate: ann.rate.toString(),
        start: ann.start.toString(),
        label: ann.label,
      });
    }
    if (!res.hasNextPage) break;
    cursor = res.nextCursor;
  }
  return out;
}

// === Provers ===

const s = (x: bigint) => x.toString();

export function proveDeposit(value: bigint, pkv: bigint, rho: bigint) {
  return prove("deposit", { value: s(value), pk: s(pkv), rho: s(rho) });
}

export function proveShielded(p: {
  valueIn: bigint;
  sk: bigint;
  rhoIn: bigint;
  pathElements: string[];
  pathIndices: string[];
  v1: bigint;
  pk1: bigint;
  rho1: bigint;
  v2: bigint;
  pk2: bigint;
  rho2: bigint;
}) {
  return prove("shielded", {
    value_in: s(p.valueIn),
    sk: s(p.sk),
    rho_in: s(p.rhoIn),
    pathElements: p.pathElements,
    pathIndices: p.pathIndices,
    v1: s(p.v1),
    pk1: s(p.pk1),
    rho1: s(p.rho1),
    v2: s(p.v2),
    pk2: s(p.pk2),
    rho2: s(p.rho2),
  } as unknown as Record<string, string>);
}

export function proveWithdraw(p: {
  valueIn: bigint;
  sk: bigint;
  rhoIn: bigint;
  pathElements: string[];
  pathIndices: string[];
  changeValue: bigint;
  pkChange: bigint;
  rhoChange: bigint;
}) {
  return prove("withdraw", {
    value_in: s(p.valueIn),
    sk: s(p.sk),
    rho_in: s(p.rhoIn),
    pathElements: p.pathElements,
    pathIndices: p.pathIndices,
    change_value: s(p.changeValue),
    pk_change: s(p.pkChange),
    rho_change: s(p.rhoChange),
  } as unknown as Record<string, string>);
}

/** Signals: shielded=[root,nf,cm1,cm2]; withdraw=[root,nf,amount,cm_change]. */
export function signalsBig(pf: ProofBytes): bigint[] {
  return pf.publicSignals.map((x) => BigInt(x));
}

// === PTB builders (streamline::shielded_pool) ===

const u8 = (tx: Transaction, b: Uint8Array) => tx.pure.vector("u8", Array.from(b));

export function buildDeposit(a: {
  packageId: string;
  coinType: string;
  poolId: string;
  sender: string;
  capBase: bigint;
  cm: bigint;
  proof: Uint8Array;
  ciphertext?: Uint8Array;
}): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(a.sender);
  tx.moveCall({
    target: `${a.packageId}::shielded_pool::deposit`,
    typeArguments: [a.coinType],
    arguments: [
      tx.object(a.poolId),
      coinWithBalance({ type: a.coinType, balance: a.capBase }),
      tx.pure.u256(a.cm),
      u8(tx, a.proof),
    ],
  });
  if (a.ciphertext) {
    tx.moveCall({
      target: `${a.packageId}::shielded_pool::publish_note`,
      typeArguments: [a.coinType],
      arguments: [tx.object(a.poolId), tx.pure.u256(a.cm), u8(tx, a.ciphertext)],
    });
  }
  return tx;
}

export function buildSpend(a: {
  packageId: string;
  coinType: string;
  poolId: string;
  root: bigint;
  nf: bigint;
  cm1: bigint;
  cm2: bigint;
  proof: Uint8Array;
  /** Encrypted opening of cm1 for a cross-party recipient (published on-chain). */
  cipher1?: Uint8Array;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${a.packageId}::shielded_pool::spend`,
    typeArguments: [a.coinType],
    arguments: [
      tx.object(a.poolId),
      tx.pure.u256(a.root),
      tx.pure.u256(a.nf),
      tx.pure.u256(a.cm1),
      tx.pure.u256(a.cm2),
      u8(tx, a.proof),
    ],
  });
  if (a.cipher1) {
    tx.moveCall({
      target: `${a.packageId}::shielded_pool::publish_note`,
      typeArguments: [a.coinType],
      arguments: [tx.object(a.poolId), tx.pure.u256(a.cm1), u8(tx, a.cipher1)],
    });
  }
  return tx;
}

export function buildWithdraw(a: {
  packageId: string;
  coinType: string;
  poolId: string;
  root: bigint;
  nf: bigint;
  amount: bigint;
  cmChange: bigint;
  proof: Uint8Array;
  recipient: string;
}): Transaction {
  const tx = new Transaction();
  const coin = tx.moveCall({
    target: `${a.packageId}::shielded_pool::withdraw`,
    typeArguments: [a.coinType],
    arguments: [
      tx.object(a.poolId),
      tx.pure.u256(a.root),
      tx.pure.u256(a.nf),
      tx.pure.u64(a.amount),
      tx.pure.u256(a.cmChange),
      u8(tx, a.proof),
    ],
  });
  tx.transferObjects([coin], tx.pure.address(a.recipient));
  return tx;
}

export { feToLeBytes };

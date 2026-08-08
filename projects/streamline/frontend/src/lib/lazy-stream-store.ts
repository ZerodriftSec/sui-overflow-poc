"use client";

/**
 * Local secret store for lazy confidential streams. Lazy streams are shared
 * objects with hidden state (remaining/earned + the vesting schedule), so the
 * openings needed to build settle/claim proofs live here, keyed by the owner's
 * address. Each settle mutates `remainingBase`/`earnedBase` and rotates the
 * blindings, so this is authoritative local state — persist after every action.
 *
 * All bigints are stored as decimal strings.
 */

export type LazyStreamSecret = {
  streamId: string;
  coinType: string;
  sender: string;
  freelancer: string;
  capBase: string;
  rate: string; // base units per second
  start: string; // unix seconds
  remainingBase: string;
  rRem: string;
  earnedBase: string;
  rEarned: string;
  rParams: string;
  createdAt: number;
};

const key = (address: string) => `sl-lazy:${address.toLowerCase()}`;

export function loadLazy(address: string): LazyStreamSecret[] {
  if (typeof window === "undefined" || !address) return [];
  try {
    const raw = localStorage.getItem(key(address));
    return raw ? (JSON.parse(raw) as LazyStreamSecret[]) : [];
  } catch {
    return [];
  }
}

export function saveLazy(address: string, list: LazyStreamSecret[]) {
  if (typeof window === "undefined" || !address) return;
  localStorage.setItem(key(address), JSON.stringify(list));
}

export function addLazy(address: string, s: LazyStreamSecret) {
  saveLazy(address, [s, ...loadLazy(address).filter((x) => x.streamId !== s.streamId)]);
}

export function updateLazy(
  address: string,
  streamId: string,
  patch: Partial<LazyStreamSecret>
) {
  saveLazy(
    address,
    loadLazy(address).map((s) => (s.streamId === streamId ? { ...s, ...patch } : s))
  );
}

/** Vested-so-far at `nowSec` for a stored stream: min(cap, rate·(now − start)). */
export function vestedBase(s: LazyStreamSecret, nowSec: number): bigint {
  const elapsed = BigInt(Math.max(0, nowSec - Number(s.start)));
  const raw = BigInt(s.rate) * elapsed;
  const cap = BigInt(s.capBase);
  return raw < cap ? raw : cap;
}

"use client";

import { randomBlinding } from "@/lib/confidential";

/**
 * Local store for shielded-pool secrets: the user's spending key `sk` (one per
 * wallet) and the openings of notes they own. Notes are shared-object state
 * (commitments in a Merkle tree); only the opening (value, rho) + your sk let you
 * spend them, and those live here. Persist after every deposit/spend/withdraw.
 */

export type ShieldedNote = {
  /** Poseidon(value, pk, rho) as a decimal string — the tree leaf. */
  commitment: string;
  value: string; // base units
  rho: string;
  spent: boolean;
  createdAt: number;
};

const skKey = (a: string) => `sl-shielded-sk:${a.toLowerCase()}`;
const notesKey = (a: string) => `sl-shielded-notes:${a.toLowerCase()}`;

/** The wallet's spending key, generated + persisted on first use. */
export function getSpendKey(address: string): bigint {
  if (typeof window === "undefined") return 0n;
  const k = skKey(address);
  const raw = localStorage.getItem(k);
  if (raw) return BigInt(raw);
  const sk = randomBlinding();
  localStorage.setItem(k, sk.toString());
  return sk;
}

export function loadNotes(address: string): ShieldedNote[] {
  if (typeof window === "undefined" || !address) return [];
  try {
    const raw = localStorage.getItem(notesKey(address));
    return raw ? (JSON.parse(raw) as ShieldedNote[]) : [];
  } catch {
    return [];
  }
}

export function saveNotes(address: string, notes: ShieldedNote[]) {
  if (typeof window === "undefined" || !address) return;
  localStorage.setItem(notesKey(address), JSON.stringify(notes));
}

export function addNote(address: string, n: ShieldedNote) {
  saveNotes(address, [
    n,
    ...loadNotes(address).filter((x) => x.commitment !== n.commitment),
  ]);
}

export function markSpent(address: string, commitment: string) {
  saveNotes(
    address,
    loadNotes(address).map((n) =>
      n.commitment === commitment ? { ...n, spent: true } : n
    )
  );
}

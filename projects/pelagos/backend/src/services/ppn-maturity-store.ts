/**
 * PPN maturity store — a backend-CONTROLLED, durable record of each protected
 * note's / tranche's maturity timestamp, written at OPEN time.
 *
 * WHY this exists: the redeem maturity gate used to read maturity exclusively
 * from `getActivePPNVault` (Supabase). On the live anon-key backend, Supabase
 * writes silently no-op under RLS, so `getActivePPNVault` returns null at redeem
 * time → `maturity_ts` is NaN → the gate's `Number.isFinite(...)` check fails →
 * the lock is SKIPPED and an early redeem at NAV is allowed, defeating the
 * locked-term product. (Audit holes B4/B5.)
 *
 * This module mirrors the durable-store pattern in sim-settlement.ts (a module
 * Map + a JSON file under process.cwd()): we record maturity HERE the moment a
 * note is opened — independent of Supabase/RLS — and the redeem gate reads from
 * this store FIRST, falling back to Supabase only if absent. A note opened after
 * this fix is ALWAYS in this store, so genuine at-maturity redeems still succeed
 * and the gate can FAIL CLOSED (reject) when no maturity can be found anywhere.
 */
import { promises as fs } from 'fs';
import { statePath } from './state-dir';

export interface PPNMaturityRecord {
  /** lowercased wallet + bundle (+ tranche kind) — the stable note identity. */
  key: string;
  wallet_address: string;
  bundle_id: string;
  tranche_kind: string | null;
  /** maturity in unix SECONDS (matches the on-chain maturity_ts convention). */
  maturity_ts: number;
  recorded_at: number;
}

// ---- store (in-memory + JSON persistence so records survive a dev restart) ----
const STORE_FILE = statePath('.ppn-maturity.json');
const records = new Map<string, PPNMaturityRecord>();
let loaded = false;
let loadPromise: Promise<void> | null = null;

/** Stable note identity: lowercased wallet + bundle (+ tranche kind). A null
 *  tranche (a plain note) and a named tranche on the same bundle are distinct
 *  positions and must key distinctly so each gets its own maturity. */
export function maturityKey(
  walletAddress: string,
  bundleId: string,
  trancheKind?: string | null,
): string {
  const kind = trancheKind && trancheKind !== 'note' ? trancheKind.toLowerCase() : 'note';
  return `${walletAddress.toLowerCase()}|${bundleId.toLowerCase()}|${kind}`;
}

async function load(): Promise<void> {
  if (loaded) return;
  // Memoize the in-flight load PROMISE so concurrent cold-start callers all await
  // the SAME read and never observe an empty Map mid-load (same discipline as
  // sim-settlement). `loaded` flips true only AFTER the read completes.
  loadPromise ??= (async () => {
    try {
      const raw = await fs.readFile(STORE_FILE, 'utf8');
      const arr = JSON.parse(raw) as PPNMaturityRecord[];
      for (const r of arr) records.set(r.key, r);
    } catch {
      /* fresh store */
    }
    loaded = true;
  })();
  await loadPromise;
}

async function persist(): Promise<void> {
  try {
    await fs.writeFile(STORE_FILE, JSON.stringify([...records.values()], null, 0));
  } catch {
    /* best-effort; in-memory remains authoritative this session */
  }
}

/**
 * Record a note's maturity at OPEN time. Called from the onchain/prepare handler
 * right where the maturity is computed, so the durable record exists before the
 * deposit is even signed — and therefore is always present when the matching
 * redeem is later attempted, regardless of Supabase/RLS state.
 *
 * Idempotent on the key: re-opening the same note refreshes its maturity (the
 * latest open wins, matching getActivePPNVault's "most recent active" semantics).
 */
export async function recordPPNMaturity(args: {
  wallet_address: string;
  bundle_id: string;
  tranche_kind?: string | null;
  maturity_ts: number;
}): Promise<void> {
  if (!args.wallet_address || !args.bundle_id) return;
  if (!Number.isFinite(args.maturity_ts)) return;
  await load();
  const key = maturityKey(args.wallet_address, args.bundle_id, args.tranche_kind);
  records.set(key, {
    key,
    wallet_address: args.wallet_address,
    bundle_id: args.bundle_id,
    tranche_kind: args.tranche_kind && args.tranche_kind !== 'note' ? args.tranche_kind : null,
    maturity_ts: Math.floor(args.maturity_ts),
    recorded_at: Date.now(),
  });
  await persist();
}

/**
 * Look up a note's maturity (unix SECONDS) from the durable store, or null if
 * we have no record. The redeem gate consults this FIRST, before Supabase.
 */
export async function getPPNMaturity(
  walletAddress: string,
  bundleId: string,
  trancheKind?: string | null,
): Promise<number | null> {
  if (!walletAddress || !bundleId) return null;
  await load();
  const rec = records.get(maturityKey(walletAddress, bundleId, trancheKind));
  return rec && Number.isFinite(rec.maturity_ts) ? rec.maturity_ts : null;
}

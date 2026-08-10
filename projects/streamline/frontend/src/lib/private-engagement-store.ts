"use client";

/**
 * Local secrets for private engagements (default private stream path).
 * No parties on-chain — openings live here + in encrypted notes.
 */

export type PrivateEngagementSecret = {
  engagementId: string;
  coinType: string;
  poolId: string;
  fundingCm: string;
  fundingRho: string;
  fundingValue: string;
  rate: string;
  start: string;
  cap: string;
  rParams: string;
  paramsCommitment: string;
  /** Shielded address of the worker (sl1…), if known. */
  workerShielded?: string;
  /** True when opened via open_engagement_v2 (has on-chain pause control). */
  pausable?: boolean;
  label?: string;
  createdAt: number;
};

const key = (address: string) => `sl-private-eng:${address.toLowerCase()}`;

export function loadEngagements(address: string): PrivateEngagementSecret[] {
  if (typeof window === "undefined" || !address) return [];
  try {
    const raw = localStorage.getItem(key(address));
    return raw ? (JSON.parse(raw) as PrivateEngagementSecret[]) : [];
  } catch {
    return [];
  }
}

export function saveEngagements(
  address: string,
  list: PrivateEngagementSecret[]
) {
  if (typeof window === "undefined" || !address) return;
  localStorage.setItem(key(address), JSON.stringify(list));
}

export function addEngagement(address: string, e: PrivateEngagementSecret) {
  saveEngagements(address, [
    e,
    ...loadEngagements(address).filter(
      (x) => x.engagementId !== e.engagementId
    ),
  ]);
}

export function updateEngagement(
  address: string,
  engagementId: string,
  patch: Partial<PrivateEngagementSecret>
) {
  saveEngagements(
    address,
    loadEngagements(address).map((e) =>
      e.engagementId === engagementId ? { ...e, ...patch } : e
    )
  );
}

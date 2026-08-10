/**
 * Enoki Identity Subnames API client.
 * @see https://docs.enoki.mystenlabs.com/subnames
 */

import { enokiNameMatchesSubname, suinsDomain } from "./handle";

export const ENOKI_API = "https://api.enoki.mystenlabs.com/v1";

export type EnokiNetwork = "mainnet" | "testnet" | "devnet";

export type SubnameStatus = "PENDING" | "ACTIVE" | "FAILED";

export type EnokiSubname = {
  name: string;
  status: SubnameStatus;
  createdAt?: string;
};

export function enokiNetwork(network: string): EnokiNetwork {
  if (network === "mainnet" || network === "testnet" || network === "devnet") {
    return network;
  }
  return "testnet";
}

export function publicEnokiKey(): string {
  return process.env.NEXT_PUBLIC_ENOKI_API_KEY?.trim() || "";
}

export function privateEnokiKey(): string {
  return process.env.ENOKI_PRIVATE_API_KEY?.trim() || "";
}

export async function createSubnameWithJwt(opts: {
  apiKey: string;
  jwt: string;
  subname: string;
  network: EnokiNetwork;
  domain?: string;
}): Promise<EnokiSubname> {
  const domain = opts.domain ?? suinsDomain();
  const res = await fetch(`${ENOKI_API}/subnames`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "zklogin-jwt": opts.jwt,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      domain,
      network: opts.network,
      subname: opts.subname,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as EnokiSubname & {
    message?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      json.message || json.error || `enoki_subname_create_failed (${res.status})`
    );
  }
  return json;
}

export async function createSubnameForAddress(opts: {
  apiKey: string;
  subname: string;
  targetAddress: string;
  network: EnokiNetwork;
  domain?: string;
}): Promise<EnokiSubname> {
  const domain = opts.domain ?? suinsDomain();
  const res = await fetch(`${ENOKI_API}/subnames`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      domain,
      network: opts.network,
      subname: opts.subname,
      targetAddress: opts.targetAddress,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as EnokiSubname & {
    message?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      json.message || json.error || `enoki_subname_create_failed (${res.status})`
    );
  }
  return json;
}

export async function listSubnamesForAddress(opts: {
  apiKey: string;
  address: string;
  network: EnokiNetwork;
  domain?: string;
}): Promise<EnokiSubname[]> {
  const domain = opts.domain ?? suinsDomain();
  const qs = new URLSearchParams({
    network: opts.network,
    address: opts.address,
    domain,
  });
  const res = await fetch(`${ENOKI_API}/subnames?${qs}`, {
    headers: { Authorization: `Bearer ${opts.apiKey}` },
  });
  const json = (await res.json().catch(() => ({}))) as {
    subnames?: EnokiSubname[];
    message?: string;
  };
  if (!res.ok) {
    throw new Error(json.message || `enoki_subname_list_failed (${res.status})`);
  }
  return json.subnames ?? [];
}

/** Poll until the requested subname is ACTIVE, FAILED, or timeout. */
export async function waitForSubnameActive(opts: {
  apiKey: string;
  address: string;
  network: EnokiNetwork;
  domain?: string;
  /** Bare username to match (required — don't accept a different ACTIVE name). */
  subname: string;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<EnokiSubname> {
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const intervalMs = opts.intervalMs ?? 1_500;
  const start = Date.now();
  const want = opts.subname.trim().toLowerCase();
  while (Date.now() - start < timeoutMs) {
    const list = await listSubnamesForAddress(opts);
    const mine = list.find((s) => enokiNameMatchesSubname(s.name, want));
    if (mine?.status === "ACTIVE") return mine;
    if (mine?.status === "FAILED") {
      throw new Error("Subname creation failed on Enoki.");
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    "Handle is still provisioning. Wait a moment and try again — don’t assume it’s live yet."
  );
}

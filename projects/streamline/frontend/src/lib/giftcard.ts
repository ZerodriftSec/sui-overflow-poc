/**
 * ZK gift cards: /g/<cardId>?s=<secretHex>&v=<amountBase>&r=<blindingHex>
 * On-chain: Poseidon commitment + blake2b256(secret). Opening lives in the URL.
 */

import { blake2b } from "@noble/hashes/blake2b";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

import { FIELD, randomBlinding } from "@/lib/confidential";

export type GiftCardParams = {
  cardId: string;
  /** 32-byte claim secret as hex (no 0x). */
  secretHex: string;
  /** Amount in USDC base units. */
  amountBase: bigint;
  /** Poseidon blinding as field element. */
  blinding: bigint;
};

export function generateGiftCardSecrets(): {
  secretBytes: Uint8Array;
  secretHex: string;
  claimHash: number[];
  blinding: bigint;
} {
  const secretBytes = crypto.getRandomValues(new Uint8Array(32));
  const secretHex = bytesToHex(secretBytes);
  const claimHash = Array.from(blake2b(secretBytes, { dkLen: 32 }));
  return { secretBytes, secretHex, claimHash, blinding: randomBlinding() };
}

/** Encode a BN254 scalar as 32-byte little-endian hex (no 0x). */
export function blindingToHex(blinding: bigint): string {
  let v = ((blinding % FIELD) + FIELD) % FIELD;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return bytesToHex(out);
}

export function blindingFromHex(hex: string): bigint | null {
  const clean = hex.replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) return null;
  const bytes = hexToBytes(clean);
  let v = 0n;
  for (let i = 31; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i]!);
  return v % FIELD;
}

export function buildGiftCardUrl(
  origin: string,
  params: GiftCardParams
): string {
  const base = origin.replace(/\/$/, "");
  const id = params.cardId.replace(/^0x/, "");
  const q = new URLSearchParams({
    s: params.secretHex,
    v: params.amountBase.toString(),
    r: blindingToHex(params.blinding),
  });
  return `${base}/g/0x${id}?${q.toString()}`;
}

export function parseGiftCardUrl(raw: string): GiftCardParams | null {
  try {
    const url = new URL(raw.trim());
    const m = url.pathname.match(/\/g\/(0x)?([0-9a-fA-F]{64})\/?$/);
    if (!m) return null;
    const secretHex = url.searchParams.get("s")?.replace(/^0x/i, "") ?? "";
    if (!/^[0-9a-fA-F]{64}$/.test(secretHex)) return null;
    const vRaw = url.searchParams.get("v") ?? "";
    if (!/^\d+$/.test(vRaw)) return null;
    const amountBase = BigInt(vRaw);
    if (amountBase <= 0n) return null;
    const blinding = blindingFromHex(url.searchParams.get("r") ?? "");
    if (blinding === null) return null;
    return {
      cardId: `0x${m[2]!.toLowerCase()}`,
      secretHex: secretHex.toLowerCase(),
      amountBase,
      blinding,
    };
  } catch {
    return null;
  }
}

export function isGiftCardPath(pathname: string): boolean {
  return /\/g\/(0x)?[0-9a-fA-F]{64}\/?$/.test(pathname);
}

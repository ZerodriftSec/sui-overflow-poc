"use client";

import { x25519 } from "@noble/curves/ed25519";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";

import { feToLeBytes } from "@/lib/confidential";

/**
 * Cross-party shielded payments. A note sent to someone else is only spendable by
 * them (its `pk1 = Poseidon(their sk, 0)`), but they also need the opening
 * `(value, rho)`. We hand that over on-chain, encrypted to the recipient, via the
 * pool's `publish_note` hook (EncryptedNote event).
 *
 * Encryption is a self-contained ECIES sealed box — x25519 ECDH → HKDF-SHA256 →
 * AES-GCM (native WebCrypto) — so no Seal key servers or on-chain access policy are
 * needed. A recipient's "shielded address" bundles both keys they must publish:
 * their Poseidon spend-pubkey `pk` (for the note) and their x25519 encryption
 * pubkey (for the opening). Both are derived deterministically from their `sk`, so
 * nothing extra is stored.
 */

// bytes ⇄ field
function leToField(b: Uint8Array): bigint {
  let v = 0n;
  for (let i = b.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[i]);
  return v;
}
function fe32(x: bigint): Uint8Array {
  const b = feToLeBytes(x);
  const out = new Uint8Array(32);
  out.set(b.slice(0, 32));
  return out;
}

/** x25519 keypair derived deterministically from the Poseidon spend key `sk`. */
export function deriveEnc(sk: bigint): { secret: Uint8Array; pub: Uint8Array } {
  const secret = sha256(concat(fe32(sk), utf8("sl-x25519-v1"))); // 32 bytes
  return { secret, pub: x25519.getPublicKey(secret) };
}

const B64 = {
  enc: (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/=+$/, ""),
  dec: (s: string) =>
    Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
      c.charCodeAt(0)
    ),
};

/** Recipient-facing address: pk (32 LE) ‖ encPub (32), base64. */
export function myShieldedAddress(sk: bigint, pkv: bigint): string {
  return "sl1" + B64.enc(concat(fe32(pkv), deriveEnc(sk).pub));
}

export function parseShieldedAddress(a: string): { pk: bigint; encPub: Uint8Array } {
  const raw = B64.dec(a.trim().replace(/^sl1/, ""));
  if (raw.length !== 64) throw new Error("Bad shielded address");
  return { pk: leToField(raw.slice(0, 32)), encPub: raw.slice(32, 64) };
}

// === sealed box: ephPub(32) ‖ iv(12) ‖ AES-GCM(value32 ‖ rho32) ===

async function aesKey(
  shared: Uint8Array,
  ephPub: Uint8Array,
  recipPub: Uint8Array,
  info = "sl-note-v1"
) {
  const raw = hkdf(sha256, shared, concat(ephPub, recipPub), utf8(info), 32);
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptNote(
  recipientEncPub: Uint8Array,
  value: bigint,
  rho: bigint
): Promise<Uint8Array> {
  const eph = x25519.utils.randomPrivateKey();
  const ephPub = x25519.getPublicKey(eph);
  const shared = x25519.getSharedSecret(eph, recipientEncPub);
  const key = await aesKey(shared, ephPub, recipientEncPub);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = concat(fe32(value), fe32(rho));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, pt as BufferSource)
  );
  return concat(ephPub, iv, ct);
}

/** Decrypt an EncryptedNote ciphertext; null if it isn't ours. */
export async function decryptNote(
  mySecret: Uint8Array,
  myPub: Uint8Array,
  ciphertext: Uint8Array
): Promise<{ value: bigint; rho: bigint } | null> {
  try {
    if (ciphertext.length < 32 + 12 + 16) return null;
    const ephPub = ciphertext.slice(0, 32);
    const iv = ciphertext.slice(32, 44);
    const body = ciphertext.slice(44);
    const shared = x25519.getSharedSecret(mySecret, ephPub);
    const key = await aesKey(shared, ephPub, myPub);
    const pt = new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, body as BufferSource)
    );
    if (pt.length !== 64) return null;
    return { value: leToField(pt.slice(0, 32)), rho: leToField(pt.slice(32, 64)) };
  } catch {
    return null; // AES-GCM tag mismatch ⇒ not addressed to us
  }
}

// === engagement announcement ===
// Same ECIES sealed box, a DISTINCT HKDF domain ("sl-engage-v1"), and a
// variable-length JSON body. Lets the recipient of a private engagement see it
// the moment it's opened — cap + vesting schedule — without any on-chain party.
// The domain separation means decryptNote and decryptEngagement never cross-read
// each other's ciphertexts (AES-GCM tag mismatch ⇒ null), so a single EncryptedNote
// scan can sort notes from announcements by which one decrypts.

export type EngagementAnnouncement = {
  /** Vesting cap (base units). */
  cap: bigint;
  /** Base units per second. */
  rate: bigint;
  /** Vesting start (unix seconds). */
  start: bigint;
  /** Opener's label for the stream (shown to the recipient too). */
  label?: string;
};

export async function encryptEngagement(
  recipientEncPub: Uint8Array,
  ann: EngagementAnnouncement
): Promise<Uint8Array> {
  const eph = x25519.utils.randomPrivateKey();
  const ephPub = x25519.getPublicKey(eph);
  const shared = x25519.getSharedSecret(eph, recipientEncPub);
  const key = await aesKey(shared, ephPub, recipientEncPub, "sl-engage-v1");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = utf8(
    JSON.stringify({
      cap: ann.cap.toString(),
      rate: ann.rate.toString(),
      start: ann.start.toString(),
      label: ann.label ?? "",
    })
  );
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, body as BufferSource)
  );
  return concat(ephPub, iv, ct);
}

/** Decrypt an EncryptedNote ciphertext as an engagement announcement; null if
 * it isn't ours or isn't an announcement. */
export async function decryptEngagement(
  mySecret: Uint8Array,
  myPub: Uint8Array,
  ciphertext: Uint8Array
): Promise<EngagementAnnouncement | null> {
  try {
    if (ciphertext.length < 32 + 12 + 16) return null;
    const ephPub = ciphertext.slice(0, 32);
    const iv = ciphertext.slice(32, 44);
    const body = ciphertext.slice(44);
    const shared = x25519.getSharedSecret(mySecret, ephPub);
    const key = await aesKey(shared, ephPub, myPub, "sl-engage-v1");
    const pt = new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, body as BufferSource)
    );
    const o = JSON.parse(new TextDecoder().decode(pt)) as Record<string, string>;
    if (typeof o.cap !== "string") return null;
    return {
      cap: BigInt(o.cap),
      rate: BigInt(o.rate),
      start: BigInt(o.start),
      label: o.label || undefined,
    };
  } catch {
    return null; // wrong domain / not ours / not an announcement
  }
}

// tiny byte helpers
function concat(...arrs: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}
function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

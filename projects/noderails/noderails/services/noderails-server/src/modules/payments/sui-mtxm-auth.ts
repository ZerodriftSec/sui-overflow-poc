import { ValidationError } from '@noderails/common';
import type { MtxmClient, MtxmSignTypedResponse } from '@noderails/mtxm-client';
import type { MtxmExecuteSponsoredResponse } from '@noderails/mtxm-client';
import { computeSuiPersonalMessageSigningDigest } from '@noderails/sui';
import { createPublicKey, verify as cryptoVerify } from 'node:crypto';
import bs58 from 'bs58';

export const SUI_ESCROW_E_BAD_AUTH = 103;

export const SUI_ESCROW_AUTH_SETUP_HINT =
  'Escrow rejected platform auth (Move abort 103 / E_BAD_AUTH). Register the MTXM Sui signer Ed25519 public key (allocate `publicBase64Key`, 32 bytes base64-decoded) in on-chain EscrowConfig `authorized_noderails_keys` via `admin::set_authorized_noderails_keys`, and the signer Sui address in `transaction_authorities`.';

export type MtxmSuiEd25519Material = {
  /** Raw 64-byte Ed25519 signature for on-chain `ed25519_verify`. */
  signature: Uint8Array;
  /** When MTXM returns a Sui-serialized signature blob, the embedded 32-byte pubkey. */
  publicKey?: Uint8Array;
};

const SUI_SIGNATURE_SCHEME_ED25519 = 0x00;

function parseEd25519MaterialFromBytes(bytes: Uint8Array, source: string): MtxmSuiEd25519Material {
  if (bytes.length === 64) {
    return { signature: bytes };
  }
  // Sui wallet / MTXM serialized form: scheme (1) + sig (64) + pubkey (32)
  if (bytes.length === 97 && bytes[0] === SUI_SIGNATURE_SCHEME_ED25519) {
    return {
      signature: bytes.slice(1, 65),
      publicKey: bytes.slice(65, 97),
    };
  }
  // Some APIs omit the scheme byte: sig (64) + pubkey (32)
  if (bytes.length === 96) {
    return {
      signature: bytes.slice(0, 64),
      publicKey: bytes.slice(64, 96),
    };
  }
  throw new ValidationError(
    `Invalid Sui signature length from MTXM (${source}): got ${bytes.length} bytes, expected 64 or Sui-serialized Ed25519`,
  );
}

/** Decode Ed25519 signature (and optional pubkey) from MTXM Sui sign-typed. */
export function decodeMtxmSuiEd25519Signature(signRes: MtxmSignTypedResponse): MtxmSuiEd25519Material {
  if (signRes.signatureBase58?.trim()) {
    return parseEd25519MaterialFromBytes(
      new Uint8Array(bs58.decode(signRes.signatureBase58.trim())),
      'signatureBase58',
    );
  }
  if (signRes.signatureBase64?.trim()) {
    return parseEd25519MaterialFromBytes(
      Uint8Array.from(Buffer.from(signRes.signatureBase64.trim(), 'base64')),
      'signatureBase64',
    );
  }
  throw new ValidationError('MTXM Sui sign-typed missing signatureBase58 or signatureBase64');
}

function ed25519SpkiFromRaw(raw32: Uint8Array): Uint8Array {
  const prefix = Uint8Array.from(Buffer.from('302a300506032b6570032100', 'hex'));
  const out = new Uint8Array(prefix.length + raw32.length);
  out.set(prefix, 0);
  out.set(raw32, prefix.length);
  return out;
}

export function verifyMtxmSuiEd25519(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  if (signature.length !== 64 || publicKey.length !== 32) {
    return false;
  }
  try {
    return cryptoVerify(
      null,
      message,
      createPublicKey({
        key: Buffer.from(ed25519SpkiFromRaw(publicKey)),
        format: 'der',
        type: 'spki',
      }),
      signature,
    );
  } catch {
    return false;
  }
}

/** MTXM Sui `sign-typed` uses Sui personal-message signing (intent + Blake2b digest), not raw preimage bytes. */
export function verifyMtxmSuiAuthMessage(
  authMessage: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  const digest = computeSuiPersonalMessageSigningDigest(authMessage);
  return verifyMtxmSuiEd25519(digest, signature, publicKey);
}

/**
 * Pick the platform Ed25519 pubkey for on-chain verify — must match the key that signed `message`.
 * Prefers allocate/env signer pubkey when it verifies; otherwise embedded pubkey from MTXM blob.
 */
export function resolveMtxmSuiPlatformPubkey(
  material: MtxmSuiEd25519Material,
  signerPubkey: Uint8Array,
  message: Uint8Array,
): Uint8Array {
  if (verifyMtxmSuiAuthMessage(message, material.signature, signerPubkey)) {
    return signerPubkey;
  }
  if (
    material.publicKey?.length === 32 &&
    verifyMtxmSuiAuthMessage(message, material.signature, material.publicKey)
  ) {
    return material.publicKey;
  }
  throw new ValidationError(
    'MTXM Sui auth signature does not verify — ensure auth preimage matches Move auth message and escrow package uses Sui personal-message digest verification',
  );
}

export function formatSuiEscrowAuthError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes(String(SUI_ESCROW_E_BAD_AUTH)) || msg.includes('E_BAD_AUTH') || msg.includes('capture_payment')) {
    return `${msg}. ${SUI_ESCROW_AUTH_SETUP_HINT}`;
  }
  return msg;
}

export type SuiSponsoredExecuteParams = {
  mtxmChainId: string;
  packageId: string;
  transactionBlockBase64: string;
  sponsorSignature: string;
  userSignature?: string;
  /** When false, only sponsor signature is submitted (sender pays own gas). */
  dualSignRequired?: boolean;
  metadata?: Record<string, unknown>;
};

/** Submit sponsored PTB per MTXM docs — dual sig when required, sponsor-only otherwise. */
export async function executeSuiSponsoredMtxm(
  mtxm: MtxmClient,
  params: SuiSponsoredExecuteParams,
): Promise<MtxmExecuteSponsoredResponse> {
  const needsUserSig = params.dualSignRequired !== false;
  if (needsUserSig && !params.userSignature?.trim()) {
    throw new ValidationError('userSignature is required when dualSignRequired is true');
  }

  return mtxm.executeSponsored({
    chainId: params.mtxmChainId,
    transactionBlockBase64: params.transactionBlockBase64,
    ...(needsUserSig
      ? {
          userSignature: params.userSignature!.trim(),
          sponsorSignature: params.sponsorSignature,
        }
      : { sponsorSignature: params.sponsorSignature }),
    track: true,
    to: params.packageId,
    metadata: params.metadata,
  });
}

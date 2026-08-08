import { normalizeSuiAddress, ValidationError } from '@noderails/common';
import type { MtxmClient } from '@noderails/mtxm-client';
import { env } from '../../config.js';

export type MtxmSuiSignerContext = {
  signerId: string;
  address: string;
  ed25519PubkeyBytes: Uint8Array;
};

function decodeEd25519PubkeyBase64(b64: string, source: string): Uint8Array {
  const trimmed = b64.trim();
  if (!trimmed) {
    throw new ValidationError(`${source} is required for Sui capture auth`);
  }
  const bytes = Uint8Array.from(Buffer.from(trimmed, 'base64'));
  if (bytes.length !== 32) {
    throw new ValidationError(`${source} must decode to 32 bytes`);
  }
  return bytes;
}

function envMtxmSuiSigner(): MtxmSuiSignerContext | null {
  const signerId = env.MTXM_SUI_SIGNER_ID?.trim();
  const address = env.MTXM_SUI_SIGNER_PUBKEY?.trim();
  const publicBase64Key = env.MTXM_SUI_ED25519_PUBKEY_BASE64?.trim();
  if (!signerId || !address || !publicBase64Key) {
    return null;
  }
  return {
    signerId,
    address: normalizeSuiAddress(address),
    ed25519PubkeyBytes: decodeEd25519PubkeyBase64(publicBase64Key, 'MTXM_SUI_ED25519_PUBKEY_BASE64'),
  };
}

/**
 * Resolve MTXM Sui signer credentials for a single logical operation.
 * Uses env vars when all three MTXM_SUI_* values are set; otherwise calls
 * `POST .../signers/allocate` at runtime (round-robin non-master pool).
 */
export async function resolveMtxmSuiSigner(mtxm: MtxmClient): Promise<MtxmSuiSignerContext> {
  const fromEnv = envMtxmSuiSigner();
  if (fromEnv) {
    return fromEnv;
  }

  const allocated = await mtxm.allocateSigner({ chainType: 'SUI' });
  if (!allocated.signerId?.trim() || !allocated.address?.trim() || !allocated.publicBase64Key?.trim()) {
    throw new ValidationError('MTXM allocate signer returned incomplete SUI signer data');
  }

  return {
    signerId: allocated.signerId.trim(),
    address: normalizeSuiAddress(allocated.address),
    ed25519PubkeyBytes: decodeEd25519PubkeyBase64(
      allocated.publicBase64Key,
      'allocate.publicBase64Key',
    ),
  };
}

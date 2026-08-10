import { bcs } from '@mysten/sui/bcs';
import { messageWithIntent } from '@mysten/sui/cryptography';
import { blake2b } from '@noble/hashes/blake2b';

/**
 * Digest MTXM / Sui wallets sign for off-chain auth bytes (`signPersonalMessage` path).
 * Must stay aligned with `auth::sui_personal_message_signing_digest` on-chain.
 */
export function computeSuiPersonalMessageSigningDigest(message: Uint8Array): Uint8Array {
  const inner = bcs.byteVector().serialize(message).toBytes();
  const intentMessage = messageWithIntent('PersonalMessage', inner);
  return blake2b(intentMessage, { dkLen: 32 });
}

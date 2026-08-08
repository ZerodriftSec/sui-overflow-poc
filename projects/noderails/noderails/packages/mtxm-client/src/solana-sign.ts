/**
 * MTXM `/transactions/sign-typed` — Solana branch validation helpers.
 * @see multichaininTxManager-api-integration-latest.md
 */

/** Normalize a SHA-256 digest to MTXM's `structHash` (0x + 64 lowercase hex). */
export function formatMtxmSolanaStructHashFromSha256Hex(digestHex: string): string {
  const h = digestHex.startsWith('0x') || digestHex.startsWith('0X') ? digestHex.slice(2) : digestHex;
  if (!/^[0-9a-fA-F]{64}$/.test(h)) {
    throw new Error('structHash: expected 64 hex chars (32-byte SHA-256 digest)');
  }
  return `0x${h.toLowerCase()}`;
}

/**
 * Base58 Solana public key shape (typical length 32 to 44 characters).
 * Does not prove on-curve validity; use for routing and basic rejection only.
 */
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,48}$/;

export function isValidSolanaAddressString(value: string): boolean {
  const s = value.trim();
  if (!s) return false;
  return SOLANA_ADDRESS_RE.test(s);
}

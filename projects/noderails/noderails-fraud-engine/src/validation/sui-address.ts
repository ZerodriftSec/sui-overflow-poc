/** Sui address shape: 0x + 1–64 hex chars (normalized before on-chain use). */
const SUI_ADDRESS_RE = /^0x[a-fA-F0-9]{1,64}$/;

export function isValidSuiAddressString(value: string): boolean {
  const s = value.trim();
  if (!s) return false;
  const normalized = s.startsWith('0x') || s.startsWith('0X') ? s : `0x${s}`;
  return SUI_ADDRESS_RE.test(normalized);
}

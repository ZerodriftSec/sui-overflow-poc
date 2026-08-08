/** Sui address helpers — `0x` + up to 64 hex chars. */
const SUI_ADDRESS_RE = /^0x[a-fA-F0-9]{1,64}$/;

export function normalizeSuiAddress(address: string): string {
  const trimmed = address.trim();
  if (!trimmed.startsWith('0x') && !trimmed.startsWith('0X')) {
    return `0x${trimmed.toLowerCase()}`;
  }
  return `0x${trimmed.slice(2).toLowerCase()}`;
}

export function isValidSuiAddress(address: string | null | undefined): boolean {
  if (!address?.trim()) return false;
  const normalized = normalizeSuiAddress(address);
  return SUI_ADDRESS_RE.test(normalized) && normalized.length >= 3;
}

export function suiAddressToBytes(address: string): Uint8Array {
  const hex = normalizeSuiAddress(address).slice(2).padStart(64, '0');
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

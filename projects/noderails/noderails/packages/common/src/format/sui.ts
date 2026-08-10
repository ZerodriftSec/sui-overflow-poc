/** Sui address validation — exported from format for chain helpers. */
const SUI_ADDRESS_RE = /^0x[a-fA-F0-9]{1,64}$/;

export const SUI_NATIVE_COIN_TYPE = '0x2::sui::SUI';

export function normalizeSuiAddress(address: string): string {
  const trimmed = address.trim();
  if (!trimmed.startsWith('0x') && !trimmed.startsWith('0X')) {
    return `0x${trimmed.toLowerCase()}`;
  }
  return `0x${trimmed.slice(2).toLowerCase()}`;
}

export function isValidSuiAddress(address: string | null | undefined): boolean {
  if (!address?.trim()) return false;
  return SUI_ADDRESS_RE.test(normalizeSuiAddress(address));
}

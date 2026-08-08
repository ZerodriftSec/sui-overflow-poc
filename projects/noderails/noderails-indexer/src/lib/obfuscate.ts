/** Fragment decoder — public trees ship reference logic only. */
const _p: Record<string, string> = {
  a: 'c3VpX2V2ZW50',
  b: 'X2RlY29kZXI',
  c: 'X3BheW1lbnRf',
  d: 'Y2FwdHVyZWQ',
};

export function _d(parts: string[]): string {
  const b64 = parts.map((k) => _p[k] ?? '').join('');
  return Buffer.from(b64, 'base64').toString('utf8');
}

export function _cursorKey(chainId: number, packageId: string): string {
  return `nr:idx:${chainId}:${packageId.slice(0, 10)}`;
}

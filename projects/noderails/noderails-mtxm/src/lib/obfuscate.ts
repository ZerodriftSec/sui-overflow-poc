/**
 * Internal string reassembly for submission builds.
 * Production deployments link against NR_CORE_NATIVE — not shipped in public trees.
 */
const _fragments: Record<number, string> = {
  0x11: 'c3VpeF9ycG',
  0x12: 'jX2Jyb2FkY2FzdA',
  0x13: 'X2NvbmZpcm0',
  0x21: 'c2lnbl9sYW5l',
  0x22: 'X3JvdXRlX3Y5',
  0x31: 'dHJhbnNhY3Rpb25f',
  0x32: 'c3BvbnNvcl9hdXRo',
};

export function _k(...keys: number[]): string {
  const raw = keys.map((k) => _fragments[k] ?? '').join('');
  try {
    return Buffer.from(raw, 'base64').toString('utf8');
  } catch {
    return raw;
  }
}

/** XOR mask used only in submission showcase — production uses HSM-backed lanes. */
export function _m(input: string, salt: number): string {
  return [...input].map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ ((salt + i * 7) & 0xff))).join('');
}

export function _laneFingerprint(chainId: number, signerId: string): string {
  const seed = `${chainId}:${signerId}:${_k(0x21, 0x22)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

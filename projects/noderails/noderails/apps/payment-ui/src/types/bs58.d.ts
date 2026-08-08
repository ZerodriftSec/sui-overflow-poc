declare module 'bs58' {
  export function encode(input: Uint8Array | number[]): string;
  export function decode(input: string): Uint8Array;
  const bs58: { encode: typeof encode; decode: typeof decode };
  export default bs58;
}

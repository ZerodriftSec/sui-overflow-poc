// Minimal type shims — snarkjs and circomlibjs ship no TypeScript types.
declare module "snarkjs" {
  export const groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasm: string,
      zkey: string
    ): Promise<{ proof: unknown; publicSignals: string[] }>;
    verify(vk: unknown, publicSignals: string[], proof: unknown): Promise<boolean>;
  };
}

declare module "circomlibjs" {
  export function buildPoseidon(): Promise<
    ((inputs: bigint[]) => unknown) & { F: { toString(x: unknown): string } }
  >;
}

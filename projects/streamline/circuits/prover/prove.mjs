// Programmatic prover: generate a Groth16 proof for a confidential circuit from
// dynamic inputs and emit the exact bytes streamline::confidential_balance
// expects. This is what the keeper (pre-proven drip schedule) and the frontend
// call — not fixed test fixtures.
//
//   node prover/prove.mjs transfer '{"vSenderOld":"500000000", ...}'
//
// Returns { vk, proof, inputs } as hex. The snarkjs proof object is converted to
// Sui's arkworks-compressed BN254 bytes by the Rust converter (byte-identical to
// fastcrypto). Server-side (keeper / Next.js route) for now; a browser-native JS
// serializer can replace the converter shell-out later.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";

import { vkToBytes, proofToBytes, publicToBytes, hex } from "./serialize.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** Generate a proof for `circuit` from `input` (object of decimal strings). */
export async function prove(circuit, input) {
  const build = join(ROOT, "build", circuit);
  const wasm = join(build, `${circuit}_js`, `${circuit}.wasm`);
  const zkey = join(build, `${circuit}.zkey`);
  const vkey = JSON.parse(readFileSync(join(build, `${circuit}.vkey.json`)));

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);

  const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  if (!ok) throw new Error(`${circuit}: snarkjs verification failed`);

  // Pure-JS serialization to Sui bytes (no Rust) — same path the browser uses.
  return {
    publicSignals,
    vk: hex(vkToBytes(vkey)),
    proof: hex(proofToBytes(proof)),
    inputs: hex(publicToBytes(publicSignals)),
  };
}

// CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , circuit, json] = process.argv;
  if (!circuit || !json) {
    console.error('usage: node prove.mjs <circuit> \'{"signal":"value",...}\'');
    process.exit(1);
  }
  const res = await prove(circuit, JSON.parse(json));
  console.log(`signals: ${JSON.stringify(res.publicSignals)}`);
  console.log(`VK_BYTES=${res.vk}`);
  console.log(`PROOF_BYTES=${res.proof}`);
  console.log(`INPUTS_BYTES=${res.inputs}`);
  process.exit(0);
}

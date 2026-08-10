#!/usr/bin/env bash
# Generate + verify a proof, and emit Sui bytes.
#
#   ./scripts/prove.sh <circuit> <input.json>
#
# Produces (in build/<circuit>/): witness, proof.json, public.json, and prints
# the VK/PROOF/INPUTS hex for sui::groth16 via the arkworks converter.
set -euo pipefail

CIRCUIT="${1:?usage: prove.sh <circuit> <input.json>}"
INPUT="${2:?usage: prove.sh <circuit> <input.json>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build/$CIRCUIT"
export PATH="$ROOT/node_modules/.bin:$PATH"

echo "▶ witness"
node "$BUILD/${CIRCUIT}_js/generate_witness.js" \
  "$BUILD/${CIRCUIT}_js/$CIRCUIT.wasm" "$INPUT" "$BUILD/witness.wtns"

echo "▶ prove"
snarkjs groth16 prove "$BUILD/$CIRCUIT.zkey" "$BUILD/witness.wtns" \
  "$BUILD/proof.json" "$BUILD/public.json"

echo "▶ snarkjs verify (sanity)"
snarkjs groth16 verify "$BUILD/${CIRCUIT}.vkey.json" "$BUILD/public.json" "$BUILD/proof.json"

echo "▶ Sui bytes"
cp "$BUILD/${CIRCUIT}.vkey.json" "$BUILD/verification_key.json"
( cd "$ROOT/converter" && cargo run --quiet --release "$BUILD" )

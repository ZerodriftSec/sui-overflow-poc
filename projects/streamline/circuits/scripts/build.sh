#!/usr/bin/env bash
# Build a production Groth16 circuit: compile → trusted setup → verifying key.
#
#   ./scripts/build.sh <circuit>          # e.g. transfer, wrap, unwrap
#
# Trusted setup is production-shaped: a sized Powers of Tau (phase 1), a phase-2
# contribution, and a random-beacon finalize. For a real deployment, replace the
# locally-generated PTAU with the Hermez perpetual powers-of-tau file
# (set PTAU=/path/to/powersOfTau28_hez_final_15.ptau) and run a multi-party
# phase-2 ceremony instead of the single contribution here.
set -euo pipefail

CIRCUIT="${1:?usage: build.sh <circuit>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src/$CIRCUIT.circom"
BUILD="$ROOT/build/$CIRCUIT"
LIB="$ROOT/node_modules/circomlib/circuits"
export PATH="$ROOT/node_modules/.bin:$PATH"

POT_POWER="${POT_POWER:-15}"          # 2^15 = 32768 constraints headroom
PTAU="${PTAU:-$ROOT/build/pot${POT_POWER}_final.ptau}"

mkdir -p "$BUILD"

echo "▶ compile $CIRCUIT"
circom "$SRC" --r1cs --wasm --sym -p bn128 -l "$ROOT/src" -l "$LIB" -o "$BUILD"
snarkjs r1cs info "$BUILD/$CIRCUIT.r1cs"

# Phase 1 — Powers of Tau (shared across circuits, generated once).
if [[ ! -f "$PTAU" ]]; then
  echo "▶ powers of tau 2^$POT_POWER (one-time)"
  snarkjs powersoftau new bn128 "$POT_POWER" "$ROOT/build/pot_0.ptau" -v
  snarkjs powersoftau contribute "$ROOT/build/pot_0.ptau" "$ROOT/build/pot_1.ptau" \
    --name="streamline-phase1" -e="$(head -c 64 /dev/urandom | xxd -p)"
  snarkjs powersoftau prepare phase2 "$ROOT/build/pot_1.ptau" "$PTAU" -v
  rm -f "$ROOT/build/pot_0.ptau" "$ROOT/build/pot_1.ptau"
fi

# Phase 2 — circuit-specific setup + contribution + beacon finalize.
echo "▶ groth16 setup + phase-2 ceremony"
snarkjs groth16 setup "$BUILD/$CIRCUIT.r1cs" "$PTAU" "$BUILD/${CIRCUIT}_0.zkey"
snarkjs zkey contribute "$BUILD/${CIRCUIT}_0.zkey" "$BUILD/${CIRCUIT}_1.zkey" \
  --name="streamline-phase2" -e="$(head -c 64 /dev/urandom | xxd -p)"
snarkjs zkey beacon "$BUILD/${CIRCUIT}_1.zkey" "$BUILD/$CIRCUIT.zkey" \
  0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20 10 \
  --name="streamline-beacon"
snarkjs zkey export verificationkey "$BUILD/$CIRCUIT.zkey" "$BUILD/${CIRCUIT}.vkey.json"
rm -f "$BUILD/${CIRCUIT}_0.zkey" "$BUILD/${CIRCUIT}_1.zkey"

echo "✓ $CIRCUIT built → $BUILD/$CIRCUIT.zkey + ${CIRCUIT}.vkey.json"

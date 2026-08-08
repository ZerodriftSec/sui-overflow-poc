#!/usr/bin/env bash
# Provisions a Sui CLI keystore from environment variables, then launches the
# keeper. Designed for ephemeral containers (Railway): it re-imports the signing
# key on every boot, which is idempotent.
#
# Required env:
#   KEEPER_SUI_PRIVATE_KEY  Bech32 private key (suiprivkey1...) for the keeper's
#                           gas-paying address. Export from a funded wallet with:
#                             sui keytool export --key-identity <address>
# Optional env:
#   SUI_RPC_URL             Fullnode RPC (default: testnet)
#   KEEPER_KEY_SCHEME       ed25519 | secp256k1 | secp256r1 (default: ed25519)
set -euo pipefail

: "${KEEPER_SUI_PRIVATE_KEY:?set KEEPER_SUI_PRIVATE_KEY (suiprivkey1... from 'sui keytool export')}"
RPC="${SUI_RPC_URL:-https://fullnode.testnet.sui.io:443}"
# Strip any whitespace/newlines the value may have picked up from a dashboard
# paste — a stray '\n' in the URL makes the CLI bail with "invalid uri character".
RPC="${RPC//[$'\t\r\n ']/}"
SCHEME="${KEEPER_KEY_SCHEME:-ed25519}"
CFG="${HOME:-/root}/.sui/sui_config"

mkdir -p "$CFG"
[ -f "$CFG/sui.keystore" ] || echo "[]" > "$CFG/sui.keystore"

cat > "$CFG/client.yaml" <<EOF
keystore:
  File: $CFG/sui.keystore
envs:
  - alias: keeper
    rpc: "$RPC"
    ws: ~
active_env: keeper
active_address: ~
EOF

# Import is idempotent across reboots; ignore "already exists".
sui keytool import "$KEEPER_SUI_PRIVATE_KEY" "$SCHEME" >/dev/null 2>&1 || true

ADDR="$(sui keytool list --json 2>/dev/null | grep -oE '0x[a-fA-F0-9]{64}' | head -1)"
if [ -z "$ADDR" ]; then
  echo "FATAL: no key in keystore — check KEEPER_SUI_PRIVATE_KEY / KEEPER_KEY_SCHEME" >&2
  exit 1
fi

sui client switch --address "$ADDR" >/dev/null 2>&1 || true
echo "keeper signing address: $ADDR  (rpc: $RPC)"

exec streamline-keeper

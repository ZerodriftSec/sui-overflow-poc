import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { Transaction, Inputs } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiGraphQLClient } from '@mysten/sui/graphql';

import { V2_PACKAGE_ID, V2_COIN_TYPE_REGISTRY_ID, V2_COIN_TYPE_REGISTRY_INIT_VERSION } from './config.js';

const client = new SuiGraphQLClient({
  url: 'https://fullnode.devnet.sui.io:443/graphql',
});

function loadKeypair(): Ed25519Keypair {
  const keystorePath = join(homedir(), ".sui", "sui_config", "sui.keystore");
  const raw = readFileSync(keystorePath, "utf8").trim();
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`No keys found in ${keystorePath}`);
  }
  const first = parsed[0];
  if (typeof first !== "string") {
    throw new Error("Unexpected keypair entry shape (expected base64 string)");
  }
  const raw_bytes = new Uint8Array(Buffer.from(first, "base64"));
  if (raw_bytes.length === 33) {
    const flag = raw_bytes[0];
    if (flag !== 0x00) {
      throw new Error(`Unsupported key scheme flag ${flag}; only ed25519 (0) is supported`);
    }
    return Ed25519Keypair.fromSecretKey(raw_bytes.slice(1));
  } else if (raw_bytes.length === 32) {
    return Ed25519Keypair.fromSecretKey(raw_bytes);
  }
  throw new Error(`Unexpected keystore entry length ${raw_bytes.length}; expected 32 or 33`);
}

const keypair = loadKeypair();
const sender = keypair.toSuiAddress();

const PACKAGE_ID = V2_PACKAGE_ID;
const REGISTRY_ID = V2_COIN_TYPE_REGISTRY_ID;
const REGISTRY_VERSION = V2_COIN_TYPE_REGISTRY_INIT_VERSION;

async function main() {
  console.log('Sender:', sender);
  console.log('Package:', PACKAGE_ID);
  console.log('Registry:', REGISTRY_ID);

  const tx = new Transaction();
  tx.setSender(sender);

  // Create AccountTypeInfo
  const info = tx.moveCall({
    target: `${PACKAGE_ID}::registry::new_account_type_info`,
    arguments: [tx.pure.string("Sui"), tx.pure.u8(9), tx.pure.bool(false)],
  });

  // Call register_coin_type
  tx.moveCall({
    target: `${PACKAGE_ID}::registry::register_coin_type`,
    typeArguments: ['0x2::sui::SUI'],
    arguments: [
      tx.object(
        Inputs.SharedObjectRef({
          objectId: REGISTRY_ID,
          mutable: true,
          initialSharedVersion: REGISTRY_VERSION,
        }),
      ),
      info,
    ],
  });

  console.log('Executing transaction...');
  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
  });

  console.log('Result:', JSON.stringify(result, null, 2));
}

main().catch(console.error);
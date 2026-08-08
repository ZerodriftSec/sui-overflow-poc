import { SuiJsonRpcClient as SuiClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { fromBase64, toBase64 } from '@mysten/sui/utils';
import { SPONSOR_PRIVATE_KEY, SPONSOR_ADDRESS, SUI_RPC_URL, NETWORK } from './config.js';

// Initialize SuiClient
export const client = new SuiClient({
  url: SUI_RPC_URL,
  network: NETWORK as 'devnet' | 'testnet' | 'mainnet',
});

// Initialize sponsor keypair
let sponsorKeypair: Ed25519Keypair | null = null;

export function getSponsorKeypair(): Ed25519Keypair {
  if (!sponsorKeypair) {
    if (!SPONSOR_PRIVATE_KEY) {
      throw new Error('SPONSOR_PRIVATE_KEY is not set in environment variables');
    }
    // The private key is stored as bech32-encoded string (suiprivkey1...)
    // First decode from hex to get the ASCII string, then decode bech32 to get raw 32 bytes
    const bech32Key = Buffer.from(SPONSOR_PRIVATE_KEY, 'hex').toString('utf8');
    const { secretKey } = decodeSuiPrivateKey(bech32Key);
    sponsorKeypair = Ed25519Keypair.fromSecretKey(secretKey);
  }
  return sponsorKeypair;
}

export function getSponsorAddress(): string {
  if (!SPONSOR_ADDRESS) {
    throw new Error('SPONSOR_ADDRESS is not set in environment variables');
  }
  return SPONSOR_ADDRESS;
}

export { Transaction, toBase64, fromBase64 };

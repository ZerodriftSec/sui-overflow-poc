import { SuiGrpcClient } from '@mysten/sui/grpc';
import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { NETWORK, SUI_RPC_URL, GRAPHQL_URL, SPONSOR_PRIVATE_KEY } from './config.js';

export const grpcClient = new SuiGrpcClient({
  network: NETWORK as any,
  baseUrl: SUI_RPC_URL || `https://fullnode.${NETWORK}.sui.io:443`,
});

export const gqlClient = new SuiGraphQLClient({
  network: NETWORK as any,
  url: GRAPHQL_URL || `https://graphql.${NETWORK}.sui.io/graphql`,
});

export function getSponsorKeypair() {
  if (!SPONSOR_PRIVATE_KEY) throw new Error("SPONSOR_PRIVATE_KEY is missing");
  // Check if it's a bech32 string starts with 'suiprivkey'
  if (SPONSOR_PRIVATE_KEY.startsWith('suiprivkey')) {
    const decoded = decodeSuiPrivateKey(SPONSOR_PRIVATE_KEY);
    return Ed25519Keypair.fromSecretKey(decoded.secretKey);
  }
  
  // Otherwise try hex
  const decodedStr = Buffer.from(SPONSOR_PRIVATE_KEY, 'hex').toString('utf8');
  if (decodedStr.startsWith('suiprivkey')) {
    const decoded = decodeSuiPrivateKey(decodedStr);
    return Ed25519Keypair.fromSecretKey(decoded.secretKey);
  }
  
  throw new Error("Invalid SPONSOR_PRIVATE_KEY format");
}

export function getSponsorAddress() {
  return getSponsorKeypair().toSuiAddress();
}

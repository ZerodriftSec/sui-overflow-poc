'use client';

import {
  SolanaSignAndSendTransaction,
  SolanaSignTransaction,
  type SolanaSignAndSendTransactionFeature,
  type SolanaSignTransactionFeature,
} from '@solana/wallet-standard-features';
import type { Connection, Transaction, TransactionSignature } from '@solana/web3.js';
import { getWalletFeature } from '@wallet-standard/ui';
import bs58 from 'bs58';
import type { UiWallet, UiWalletAccount } from '@wallet-standard/ui-core';

type SolanaChainId = `solana:${string}`;

function chainFromRpcEndpoint(rpcEndpoint: string): SolanaChainId {
  if (rpcEndpoint.includes('devnet')) return 'solana:devnet';
  if (rpcEndpoint.includes('testnet')) return 'solana:testnet';
  return 'solana:mainnet';
}

function chainFromCluster(cluster: string | number | undefined, rpcEndpoint: string): SolanaChainId {
  const normalized = String(cluster ?? '').toLowerCase();
  if (normalized.includes('devnet')) return 'solana:devnet';
  if (normalized.includes('testnet')) return 'solana:testnet';
  if (normalized.includes('mainnet')) return 'solana:mainnet';
  return chainFromRpcEndpoint(rpcEndpoint);
}

/** Pick a chain id the connected account actually advertises (handles mainnet-beta aliases). */
function resolveAccountChain(account: UiWalletAccount, preferred: SolanaChainId): SolanaChainId {
  if (account.chains.includes(preferred)) return preferred;

  const aliases: Partial<Record<SolanaChainId, SolanaChainId[]>> = {
    'solana:mainnet': ['solana:mainnet-beta'],
    'solana:mainnet-beta': ['solana:mainnet'],
  };

  for (const alias of aliases[preferred] ?? []) {
    if (account.chains.includes(alias)) return alias;
  }

  const fallback = account.chains.find((chain) => chain.startsWith('solana:'));
  if (fallback) return fallback as SolanaChainId;

  return preferred;
}

/**
 * Send a legacy Transaction via the Wallet Standard wallet connected through Satellite.
 * UiWallet.features is a string[] of capability names — use getWalletFeature() for implementations.
 */
export async function sendSolanaTransaction(
  transaction: Transaction,
  connection: Connection,
  wallet: UiWallet,
  account: UiWalletAccount,
  options: { skipPreflight?: boolean; chainCluster?: string | number } = {},
): Promise<TransactionSignature> {
  const preferredChain = chainFromCluster(options.chainCluster, connection.rpcEndpoint);
  const chain = resolveAccountChain(account, preferredChain);

  const serialized = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });

  if (wallet.features.includes(SolanaSignAndSendTransaction)) {
    const feature = getWalletFeature(
      wallet,
      SolanaSignAndSendTransaction,
    ) as SolanaSignAndSendTransactionFeature[typeof SolanaSignAndSendTransaction];
    const [result] = await feature.signAndSendTransaction({
      account,
      chain,
      transaction: serialized,
      options: {
        preflightCommitment: options.skipPreflight ? 'processed' : 'confirmed',
        skipPreflight: options.skipPreflight ?? false,
      },
    });
    const sig = result.signature;
    return typeof sig === 'string' ? sig : bs58.encode(sig);
  }

  if (wallet.features.includes(SolanaSignTransaction)) {
    const feature = getWalletFeature(
      wallet,
      SolanaSignTransaction,
    ) as SolanaSignTransactionFeature[typeof SolanaSignTransaction];
    const [signed] = await feature.signTransaction({
      account,
      chain,
      transaction: serialized,
    });
    const signature = await connection.sendRawTransaction(signed.signedTransaction, {
      skipPreflight: options.skipPreflight ?? false,
      preflightCommitment: 'confirmed',
    });
    await connection.confirmTransaction(signature, 'confirmed');
    return signature;
  }

  throw new Error('Connected wallet does not support Solana transaction signing');
}

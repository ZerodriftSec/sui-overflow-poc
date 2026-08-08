'use client';

import { useCallback } from 'react';
import { useCurrentAccount, useSignAndExecuteTransaction, useSignTransaction } from '@mysten/dapp-kit';
import {
  OrbitAdapter,
  formatConnectorName,
  getAdapterFromConnectorType,
  getConnectorTypeFromName,
} from '@tuwaio/orbit-core';
import { getAvailableSolanaConnectors } from '@tuwaio/orbit-solana';
import type { SolanaConnection } from '@tuwaio/satellite-solana';
import { useSatelliteConnectStore } from '@tuwaio/satellite-react';
import { useAccount } from 'wagmi';
import type { UiWallet, UiWalletAccount } from '@wallet-standard/ui-core';

function resolveLiveSolanaWalletPair(connection: SolanaConnection): {
  wallet: UiWallet;
  account: UiWalletAccount;
} {
  const wallets = getAvailableSolanaConnectors();
  const wallet =
    wallets.find(
      (candidate) =>
        getConnectorTypeFromName(OrbitAdapter.SOLANA, formatConnectorName(candidate.name)) ===
        connection.connectorType,
    ) ??
    wallets.find((candidate) =>
      candidate.accounts.some((account) => account.address === connection.address),
    ) ??
    connection.connectedWallet;

  if (!wallet) {
    throw new Error('Connect a Solana wallet first');
  }

  const account =
    wallet.accounts.find((candidate) => candidate.address === connection.address) ??
    wallet.accounts[0] ??
    connection.connectedAccount;

  if (!account) {
    throw new Error('Connect a Solana wallet first');
  }

  return { wallet, account };
}

export function useCheckoutWallet(selectedChainType?: 'EVM' | 'SOLANA' | 'SUI') {
  const activeConnection = useSatelliteConnectStore((state) => state.activeConnection);
  const { isConnected: evmConnected, address: evmAddress, chainId: walletChainId } = useAccount();
  const suiAccount = useCurrentAccount();

  const solanaConnection =
    activeConnection &&
    getAdapterFromConnectorType(activeConnection.connectorType) === OrbitAdapter.SOLANA
      ? (activeConnection as SolanaConnection)
      : undefined;

  const isSolana = selectedChainType === 'SOLANA';
  const isSui = selectedChainType === 'SUI';
  const isEvm = selectedChainType !== 'SOLANA' && selectedChainType !== 'SUI' && selectedChainType != null;

  const connected = isSui
    ? Boolean(suiAccount?.address)
    : isSolana
      ? Boolean(solanaConnection?.isConnected && solanaConnection.address)
      : isEvm
        ? evmConnected
        : Boolean(solanaConnection?.isConnected || evmConnected || suiAccount?.address);

  const connectedAddress = isSui
    ? suiAccount?.address ?? null
    : isSolana
      ? solanaConnection?.address ?? null
      : isEvm
        ? evmAddress ?? null
        : (solanaConnection?.address ?? evmAddress ?? suiAccount?.address ?? null);

  return {
    activeConnection,
    solanaConnection,
    suiAccount,
    connected,
    connectedAddress,
    walletChainId,
    evmAddress,
    solanaPublicKey: solanaConnection?.address ?? null,
    suiAddress: suiAccount?.address ?? null,
  };
}

export function useSatelliteSuiSignAndExecute() {
  const suiAccount = useCurrentAccount();
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const { mutateAsync: signTransaction } = useSignTransaction();

  const signAndExecute = useCallback(
    async (tx: Parameters<typeof signAndExecuteTransaction>[0]['transaction']) => {
      if (!suiAccount?.address) {
        throw new Error('Connect a Sui wallet first');
      }
      const result = await signAndExecuteTransaction({ transaction: tx });
      return { digest: result.digest };
    },
    [signAndExecuteTransaction, suiAccount?.address],
  );

  const signTransactionBlock = useCallback(
    async (transactionBlockBase64: string) => {
      if (!suiAccount?.address) {
        throw new Error('Connect a Sui wallet first');
      }
      const { signature } = await signTransaction({
        transaction: transactionBlockBase64,
      });
      return signature;
    },
    [signTransaction, suiAccount?.address],
  );

  return { signAndExecute, signTransactionBlock, suiAccount };
}

export function useSatelliteSolanaSend() {
  const solanaConnection = useSatelliteConnectStore((state) => {
    const active = state.activeConnection;
    if (!active || getAdapterFromConnectorType(active.connectorType) !== OrbitAdapter.SOLANA) {
      return undefined;
    }
    return active as SolanaConnection;
  });

  const sendTransaction = useCallback(
    async (
      transaction: import('@solana/web3.js').Transaction,
      connection: import('@solana/web3.js').Connection,
      options?: { skipPreflight?: boolean },
    ) => {
      const { sendSolanaTransaction } = await import('./solana-signing');
      if (!solanaConnection?.isConnected || !solanaConnection.address) {
        throw new Error('Connect a Solana wallet first');
      }
      const { wallet, account } = resolveLiveSolanaWalletPair(solanaConnection);
      return sendSolanaTransaction(transaction, connection, wallet, account, {
        ...options,
        chainCluster: solanaConnection.chainId,
      });
    },
    [solanaConnection],
  );

  return { sendTransaction, solanaConnection };
}
